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
  userId: string;
  submissionId: string | null;
  mediaId: string | null;
  storageProfileId: string | null;
  storageProvider: string;
  bucket: string;
  storageKey: string;
  uploadId: string | null;
  isVirtual: boolean;
  status: UploadSessionStatus;
  mediaType: string;
  mimeType: string;
  originalFileName: string | null;
  fileSize: bigint | null;
  partSize: number | null;
  totalParts: number | null;
  uploadedParts: unknown;
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

  // ─── POST /upload-sessions ─────────────────────────────────────────────────
  async create(
    userId: string,
    body: {
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
        userId,
        submissionId: body.submissionId ?? null,
        storageProfileId: profileId,
        storageProvider: providerType,
        bucket,
        storageKey,
        uploadId,
        isVirtual,
        status: 'PENDING',
        mediaType: body.mediaType,
        mimeType: body.mimeType,
        originalFileName: body.originalFileName ?? null,
        fileSize: body.fileSize ? BigInt(body.fileSize) : null,
        partSize,
        totalParts,
        uploadedParts: [],
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

    // Mark IN_PROGRESS if we already handed out part URLs
    if (parts.length > 0) {
      await this.prisma.uploadSession.update({
        where: { id: session.id },
        data: { status: 'IN_PROGRESS' },
      });
    }

    return {
      ...formatSession(session),
      status: parts.length > 0 ? 'IN_PROGRESS' : 'PENDING',
      parts,
    };
  }

  // ─── GET /upload-sessions/:id ──────────────────────────────────────────────
  async findOne(userId: string, id: string) {
    const session = await this.prisma.uploadSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Upload session not found');
    if (session.userId !== userId) throw new ForbiddenException('Access denied');
    return formatSession(session);
  }

  // ─── POST /upload-sessions/:id/refresh-urls ────────────────────────────────
  async refreshUrls(
    userId: string,
    id: string,
    body: { partNumbers: number[] },
  ) {
    const session = await this.prisma.uploadSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Upload session not found');
    if (session.userId !== userId) throw new ForbiddenException('Access denied');
    if (session.status === 'COMPLETED') {
      throw new ConflictException('Upload session is already completed');
    }
    if (session.status === 'ABORTED') {
      throw new ConflictException('Upload session has been aborted');
    }
    if (new Date() > session.expiresAt) {
      throw new BadRequestException('Upload session has expired');
    }
    if (!session.uploadId) {
      throw new BadRequestException('Upload session has no uploadId');
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
        uploadId: session.uploadId,
        partNumber,
      });
      parts.push({ partNumber, uploadUrl });
    }

    // Mark IN_PROGRESS on first URL request
    if (session.status === 'PENDING') {
      await this.prisma.uploadSession.update({
        where: { id },
        data: { status: 'IN_PROGRESS' },
      });
    }

    return { parts, expiresIn: PART_URL_TTL };
  }

  // ─── POST /upload-sessions/:id/complete ───────────────────────────────────
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

    // Idempotent: already completed — return existing result
    if (session.status === 'COMPLETED' && session.mediaId) {
      const media = await this.prisma.submissionMedia.findUnique({
        where: { id: session.mediaId },
        select: { mediaUrl: true },
      });
      return {
        mediaId: session.mediaId,
        storageKey: session.storageKey,
        mediaUrl: media?.mediaUrl ?? session.storageKey,
      };
    }

    if (session.status === 'ABORTED') {
      throw new ConflictException('Upload session has been aborted');
    }

    const provider = await this.storage.getProviderForProfileId(session.storageProfileId);

    const completedParts = body.parts ?? [];
    const { mediaUrl } = await provider.completeMultipartUpload({
      storageKey: session.storageKey,
      uploadId: session.uploadId ?? '',
      parts: completedParts,
    });

    const submissionId = body.submissionId ?? session.submissionId;

    // Create SubmissionMedia (idempotent via session.mediaId guard above)
    let mediaId: string | null = null;
    if (submissionId) {
      const submission = await this.prisma.submission.findUnique({
        where: { id: submissionId },
        select: { userId: true },
      });
      if (!submission) throw new NotFoundException('Submission not found');
      if (submission.userId !== userId) throw new ForbiddenException('Access denied');

      try {
        const media = await this.prisma.submissionMedia.create({
          data: {
            submissionId,
            mediaType: session.mediaType as MediaType,
            storageKey: session.storageKey,
            mediaUrl,
            storageProfileId: session.storageProfileId,
            storageProvider: session.storageProvider,
            bucket: session.bucket,
            originalFileName: session.originalFileName,
            mimeType: session.mimeType,
            fileSize: session.fileSize,
            sortOrder: body.sortOrder ?? 0,
            uploadStatus: 'UPLOADED' as MediaUploadStatus,
          },
        });
        mediaId = media.id;
      } catch (err: unknown) {
        // If media creation fails due to a race, try to find an existing one
        // linked to this upload session (via storageKey match)
        const existing = await this.prisma.submissionMedia.findFirst({
          where: { submissionId, storageKey: session.storageKey },
          select: { id: true },
        });
        if (existing) {
          mediaId = existing.id;
        } else {
          throw err;
        }
      }
    }

    // Persist uploaded parts + mark completed atomically
    await this.prisma.uploadSession.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        mediaId: mediaId ?? undefined,
        submissionId: submissionId ?? undefined,
        uploadedParts: completedParts as object[],
      },
    });

    this.logger.log(
      `UploadSession completed: id=${id} userId=${userId} mediaId=${mediaId}`,
    );

    return { mediaId, storageKey: session.storageKey, mediaUrl };
  }

  // ─── DELETE /upload-sessions/:id ──────────────────────────────────────────
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
        uploadId: session.uploadId ?? '',
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
