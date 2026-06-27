import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { CompletedPart } from '../storage/providers/storage-provider.interface';
import { UploadSessionStatus, MediaType, MediaUploadStatus } from '@prisma/client';

const DEFAULT_PART_SIZE = 10 * 1024 * 1024; // 10 MB
const MIN_PART_SIZE = 5 * 1024 * 1024;      // 5 MB (S3 minimum)
const SESSION_TTL_HOURS = 24;
const PART_URL_TTL = 900;

function computeTotalParts(fileSize: number, partSize: number): number {
  return Math.ceil(fileSize / partSize);
}

function formatSession(s: {
  id: string;
  idempotencyKey: string | null;
  userId: string;
  submissionId: string | null;
  mediaId: string | null;
  storageProfileId: string | null;
  storageProvider: string;
  bucket: string;
  storageKey: string;
  remoteSessionId: string | null;
  isVirtual: boolean;
  status: UploadSessionStatus;
  mediaType: string;
  mimeType: string;
  originalFileName: string | null;
  fileSize: bigint | null;
  partSize: number | null;
  totalParts: number | null;
  completedParts: unknown;
  expiresAt: Date;
  completedAt: Date | null;
  abortedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...s,
    fileSize: s.fileSize != null ? Number(s.fileSize) : null,
  };
}

@Injectable()
export class UploadSessionService {
  private readonly logger = new Logger(UploadSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ─── POST /submissions/upload-sessions ─────────────────────────────────────
  async create(
    userId: string,
    body: {
      idempotencyKey?: string;
      submissionId?: string;
      mediaType: string;
      mimeType: string;
      originalFileName?: string;
      fileSize?: number;
      partSize?: number;
      requestedPartNumbers?: number[];
    },
  ) {
    const validTypes: string[] = ['VIDEO', 'IMAGE', 'AUDIO'];
    if (!validTypes.includes(body.mediaType)) {
      throw new BadRequestException(
        `Invalid mediaType. Must be one of: ${validTypes.join(', ')}`,
      );
    }

    // Idempotent create: return existing session if same key
    if (body.idempotencyKey) {
      const existing = await this.prisma.uploadSession.findUnique({
        where: { idempotencyKey: body.idempotencyKey },
      });
      if (existing && existing.userId === userId) {
        return { ...formatSession(existing), parts: [] };
      }
    }

    if (body.submissionId) {
      const submission = await this.prisma.submission.findUnique({
        where: { id: body.submissionId },
        select: { userId: true },
      });
      if (!submission) throw new NotFoundException('Submission not found');
      if (submission.userId !== userId) throw new ForbiddenException('Access denied');
    }

    const { provider, profileId, providerType, bucket, keyPrefix } =
      await this.storage.getActiveProvider();

    const { uploadId, storageKey, isVirtual } = await provider.initiateMultipartUpload({
      keyPrefix,
      submissionId: body.submissionId,
      fileName: body.originalFileName,
      contentType: body.mimeType,
    });

    const requestedPart = body.partSize ?? DEFAULT_PART_SIZE;
    const partSize = isVirtual ? null : Math.max(requestedPart, MIN_PART_SIZE);
    const totalParts =
      body.fileSize && partSize ? computeTotalParts(body.fileSize, partSize) : null;

    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

    const session = await this.prisma.uploadSession.create({
      data: {
        idempotencyKey: body.idempotencyKey ?? null,
        userId,
        submissionId: body.submissionId ?? null,
        storageProfileId: profileId,
        storageProvider: providerType,
        bucket,
        storageKey,
        remoteSessionId: uploadId,
        isVirtual,
        status: 'CREATED',
        mediaType: body.mediaType,
        mimeType: body.mimeType,
        originalFileName: body.originalFileName ?? null,
        fileSize: body.fileSize ? BigInt(body.fileSize) : null,
        partSize,
        totalParts,
        completedParts: [],
        expiresAt,
      },
    });

    this.logger.log(
      `UploadSession created: id=${session.id} userId=${userId} provider=${providerType} virtual=${isVirtual}`,
    );

    // Generate presigned URLs for requested part numbers
    const parts: Array<{ partNumber: number; uploadUrl: string }> = [];

    if (isVirtual) {
      // Virtual session always gets part 1
      const { uploadUrl } = await provider.generatePartUploadUrl({
        storageKey,
        uploadId,
        partNumber: 1,
      });
      parts.push({ partNumber: 1, uploadUrl });
    } else if (body.requestedPartNumbers && body.requestedPartNumbers.length > 0) {
      // S3 — generate URLs for all requested part numbers
      for (const partNumber of body.requestedPartNumbers) {
        if (partNumber < 1) continue;
        if (totalParts && partNumber > totalParts) continue;
        const { uploadUrl } = await provider.generatePartUploadUrl({
          storageKey,
          uploadId,
          partNumber,
        });
        parts.push({ partNumber, uploadUrl });
      }
    }

    // Mark ACTIVE once we've handed out part URLs
    if (parts.length > 0) {
      await this.prisma.uploadSession.update({
        where: { id: session.id },
        data: { status: 'ACTIVE' },
      });
    }

    return {
      ...formatSession(session),
      status: parts.length > 0 ? 'ACTIVE' : 'CREATED',
      parts,
    };
  }

  // ─── GET /submissions/upload-sessions/:id ──────────────────────────────────
  async findOne(userId: string, id: string) {
    const session = await this.prisma.uploadSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Upload session not found');
    if (session.userId !== userId) throw new ForbiddenException('Access denied');
    return formatSession(session);
  }

  // ─── POST /submissions/upload-sessions/:id/refresh-urls ────────────────────
  async refreshUrls(
    userId: string,
    id: string,
    body: { partNumbers: number[] },
  ) {
    const session = await this.prisma.uploadSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Upload session not found');
    if (session.userId !== userId) throw new ForbiddenException('Access denied');
    if (session.status === 'COMPLETED' || session.status === 'COMPLETING') {
      throw new ConflictException('Upload session is already completed');
    }
    if (session.status === 'ABORTED') {
      throw new ConflictException('Upload session has been aborted');
    }
    if (new Date() > session.expiresAt) {
      throw new BadRequestException('Upload session has expired');
    }
    if (!session.remoteSessionId) {
      throw new BadRequestException('Upload session has no remoteSessionId');
    }
    if (!body.partNumbers || body.partNumbers.length === 0) {
      throw new BadRequestException('partNumbers must be a non-empty array');
    }

    // Validate part numbers
    for (const pn of body.partNumbers) {
      if (pn < 1) throw new BadRequestException(`partNumber ${pn} must be >= 1`);
      if (session.totalParts && pn > session.totalParts) {
        throw new BadRequestException(
          `partNumber ${pn} exceeds totalParts ${session.totalParts}`,
        );
      }
      if (session.isVirtual && pn !== 1) {
        throw new BadRequestException(
          'Replit storage only supports single-part uploads (partNumber must be 1)',
        );
      }
    }

    const provider = await this.storage.getProviderForProfileId(session.storageProfileId);

    const parts: Array<{ partNumber: number; uploadUrl: string }> = [];
    for (const partNumber of body.partNumbers) {
      const { uploadUrl } = await provider.generatePartUploadUrl({
        storageKey: session.storageKey,
        uploadId: session.remoteSessionId,
        partNumber,
      });
      parts.push({ partNumber, uploadUrl });
    }

    // Mark ACTIVE on first URL request
    if (session.status === 'CREATED') {
      await this.prisma.uploadSession.update({
        where: { id },
        data: { status: 'ACTIVE' },
      });
    }

    return { parts, expiresIn: PART_URL_TTL };
  }

  // ─── POST /submissions/upload-sessions/:id/complete ────────────────────────
  async complete(
    userId: string,
    id: string,
    body: {
      parts?: CompletedPart[];
      submissionId?: string;
      sortOrder?: number;
    },
  ) {
    const session = await this.prisma.uploadSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Upload session not found');
    if (session.userId !== userId) throw new ForbiddenException('Access denied');

    // Fully idempotent: any COMPLETED session returns stored result without re-calling provider
    if (session.status === 'COMPLETED') {
      const mediaUrl = session.mediaId
        ? (await this.prisma.submissionMedia.findUnique({
            where: { id: session.mediaId },
            select: { mediaUrl: true },
          }))?.mediaUrl ?? session.storageKey
        : session.storageKey;
      return {
        mediaId: session.mediaId,
        storageKey: session.storageKey,
        mediaUrl,
      };
    }

    if (session.status === 'ABORTED') {
      throw new ConflictException('Upload session has been aborted');
    }

    // Atomically transition CREATED|ACTIVE → COMPLETING (prevents concurrent duplicates)
    const transitioned = await this.prisma.uploadSession.updateMany({
      where: { id, status: { in: ['CREATED', 'ACTIVE'] } },
      data: { status: 'COMPLETING' },
    });

    if (transitioned.count === 0) {
      // Either already COMPLETING (concurrent caller) or some other terminal state
      const fresh = await this.prisma.uploadSession.findUnique({ where: { id } });
      if (fresh?.status === 'COMPLETED') {
        const mediaUrl = fresh.mediaId
          ? (await this.prisma.submissionMedia.findUnique({
              where: { id: fresh.mediaId },
              select: { mediaUrl: true },
            }))?.mediaUrl ?? fresh.storageKey
          : fresh.storageKey;
        return { mediaId: fresh.mediaId, storageKey: fresh.storageKey, mediaUrl };
      }
      throw new ConflictException(
        `Upload session cannot be completed in its current state (${fresh?.status ?? 'unknown'})`,
      );
    }

    const provider = await this.storage.getProviderForProfileId(session.storageProfileId);
    const incomingParts = body.parts ?? [];
    const submissionId = body.submissionId ?? session.submissionId;

    let mediaId: string | null = null;
    let mediaUrl: string;

    try {
      ({ mediaUrl } = await provider.completeMultipartUpload({
        storageKey: session.storageKey,
        uploadId: session.remoteSessionId ?? '',
        parts: incomingParts,
      }));

      // Upsert SubmissionMedia idempotently via (submissionId, sortOrder)
      if (submissionId) {
        const submission = await this.prisma.submission.findUnique({
          where: { id: submissionId },
          select: { userId: true },
        });
        if (!submission) throw new NotFoundException('Submission not found');
        if (submission.userId !== userId) throw new ForbiddenException('Access denied');

        const sortOrder = body.sortOrder ?? 0;
        const mediaData = {
          mediaType: session.mediaType as MediaType,
          storageKey: session.storageKey,
          mediaUrl,
          storageProfileId: session.storageProfileId,
          storageProvider: session.storageProvider,
          bucket: session.bucket,
          originalFileName: session.originalFileName,
          mimeType: session.mimeType,
          fileSize: session.fileSize,
          uploadStatus: 'UPLOADED' as MediaUploadStatus,
        };

        const media = await this.prisma.submissionMedia.upsert({
          where: { submissionId_sortOrder: { submissionId, sortOrder } },
          create: { submissionId, sortOrder, ...mediaData },
          update: mediaData,
          select: { id: true },
        });
        mediaId = media.id;
      }
    } catch (err) {
      // On any failure, mark FAILED so the session is not permanently stuck in COMPLETING
      await this.prisma.uploadSession.update({
        where: { id },
        data: { status: 'FAILED' },
      }).catch(() => { /* best-effort */ });
      throw err;
    }

    // Persist completedParts + mark COMPLETED atomically
    await this.prisma.uploadSession.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        mediaId: mediaId ?? undefined,
        submissionId: submissionId ?? undefined,
        completedParts: incomingParts as object[],
      },
    });

    this.logger.log(
      `UploadSession completed: id=${id} userId=${userId} mediaId=${mediaId}`,
    );

    return { mediaId, storageKey: session.storageKey, mediaUrl };
  }

  // ─── DELETE /submissions/upload-sessions/:id ───────────────────────────────
  async abort(userId: string, id: string) {
    const session = await this.prisma.uploadSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Upload session not found');
    if (session.userId !== userId) throw new ForbiddenException('Access denied');

    if (session.status === 'COMPLETED') {
      throw new ConflictException('Cannot abort a completed upload session');
    }
    if (session.status === 'ABORTED') {
      return { aborted: true };
    }

    const provider = await this.storage.getProviderForProfileId(session.storageProfileId);

    try {
      await provider.abortMultipartUpload({
        storageKey: session.storageKey,
        uploadId: session.remoteSessionId ?? '',
      });
    } catch (err) {
      this.logger.warn(
        `abortMultipartUpload failed for session ${id}: ${err instanceof Error ? err.message : err}`,
      );
    }

    await this.prisma.uploadSession.update({
      where: { id },
      data: { status: 'ABORTED', abortedAt: new Date() },
    });

    this.logger.log(`UploadSession aborted: id=${id} userId=${userId}`);
    return { aborted: true };
  }
}
