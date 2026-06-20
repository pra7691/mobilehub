import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType, NotificationEntityType } from '@prisma/client';
import {
  SubmissionStatus,
  MediaType,
  MediaUploadStatus,
  CollectionType,
  Prisma,
} from '@prisma/client';

// Max file sizes in bytes
const MAX_VIDEO_SIZE = 500 * 1024 * 1024;
const MAX_AUDIO_SIZE = 100 * 1024 * 1024;
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

// Presigned URL TTL in seconds (15 minutes)
const UPLOAD_URL_TTL = 900;

function getMediaTypeForCollection(collectionType: CollectionType): MediaType {
  switch (collectionType) {
    case 'VIDEO': return 'VIDEO';
    case 'AUDIO': return 'AUDIO';
    case 'IMAGE': return 'IMAGE';
  }
}

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    mp3: 'audio/mpeg',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  return map[ext] ?? 'application/octet-stream';
}

function getMaxFileSizeForType(mediaType: MediaType): number {
  switch (mediaType) {
    case 'VIDEO': return MAX_VIDEO_SIZE;
    case 'AUDIO': return MAX_AUDIO_SIZE;
    case 'IMAGE': return MAX_IMAGE_SIZE;
    default: return MAX_IMAGE_SIZE;
  }
}

function buildTaskSnapshot(task: {
  id: string;
  title: string;
  description: string | null;
  detailedInstructions: string | null;
  collectionType: CollectionType;
  paymentAmount: Prisma.Decimal;
  currency: string;
  minimumDurationSeconds: number | null;
  maximumDurationSeconds: number | null;
  minimumImageCount: number | null;
  maximumImageCount: number | null;
  category: { id: string; name: string };
  subcategory: { id: string; name: string } | null;
}): object {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    detailedInstructions: task.detailedInstructions,
    collectionType: task.collectionType,
    paymentAmount: task.paymentAmount.toNumber(),
    currency: task.currency,
    minimumDurationSeconds: task.minimumDurationSeconds,
    maximumDurationSeconds: task.maximumDurationSeconds,
    minimumImageCount: task.minimumImageCount,
    maximumImageCount: task.maximumImageCount,
    category: task.category,
    subcategory: task.subcategory,
  };
}

function formatSubmission(s: {
  id: string;
  userId: string;
  taskId: string;
  categoryId: string | null;
  subcategoryId: string | null;
  collectionType: CollectionType;
  status: SubmissionStatus;
  submittedAt: Date | null;
  uploadStartedAt: Date | null;
  uploadCompletedAt: Date | null;
  captureStartedAt: Date | null;
  captureEndedAt: Date | null;
  durationSeconds: number | null;
  imageCount: number | null;
  totalFileSize: bigint | null;
  devicePlatform: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  cameraUsed: string | null;
  lensRequested: string | null;
  orientation: string | null;
  captureMetadata: Prisma.JsonValue | null;
  taskSnapshot: Prisma.JsonValue;
  paymentAmountSnapshot: Prisma.Decimal;
  currencySnapshot: string;
  failureReason: string | null;
  approvedAmount: Prisma.Decimal | null;
  rejectionReason: string | null;
  resubmissionReason: string | null;
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  task?: object | null;
  user?: object | null;
  media?: {
    id: string;
    mediaType: MediaType;
    storageKey: string;
    mediaUrl: string;
    thumbnailUrl: string | null;
    fileSize: bigint | null;
    durationSeconds: number | null;
    mimeType: string;
    sortOrder: number;
    uploadStatus: MediaUploadStatus;
  }[];
}) {
  return {
    ...s,
    totalFileSize: s.totalFileSize != null ? Number(s.totalFileSize) : null,
    paymentAmountSnapshot: s.paymentAmountSnapshot.toNumber(),
    approvedAmount: s.approvedAmount != null ? s.approvedAmount.toNumber() : null,
    media: s.media?.map(m => ({
      ...m,
      fileSize: m.fileSize != null ? Number(m.fileSize) : null,
    })) ?? [],
  };
}

const SUBMISSION_INCLUDE = {
  task: {
    select: {
      id: true,
      title: true,
      collectionType: true,
      paymentAmount: true,
      currency: true,
      status: true,
      category: { select: { id: true, name: true } },
      subcategory: { select: { id: true, name: true } },
    },
  },
  user: { select: { id: true, phoneNumber: true, name: true, status: true } },
  media: {
    select: {
      id: true,
      mediaType: true,
      storageKey: true,
      mediaUrl: true,
      thumbnailUrl: true,
      fileSize: true,
      durationSeconds: true,
      mimeType: true,
      sortOrder: true,
      uploadStatus: true,
    },
    orderBy: { sortOrder: 'asc' as const },
  },
} satisfies Prisma.SubmissionInclude;

@Injectable()
export class SubmissionsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private walletService: WalletService,
    private notificationsService: NotificationsService,
  ) {}

  // ─── POST /submissions/initiate ────────────────────────────────────────────
  async initiate(
    userId: string,
    body: {
      taskId: string;
      mediaFiles: Array<{
        filename: string;
        fileSize?: number;
        contentType?: string;
      }>;
      durationSeconds?: number;
      imageCount?: number;
      captureMetadata?: object;
      captureStartedAt?: string;
      captureEndedAt?: string;
      devicePlatform?: string;
      deviceModel?: string;
      osVersion?: string;
      cameraUsed?: string;
      lensRequested?: string;
      orientation?: string;
    },
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: body.taskId },
      include: {
        category: { select: { id: true, name: true } },
        subcategory: { select: { id: true, name: true } },
      },
    });
    if (!task || task.deletedAt) throw new NotFoundException('Task not found');
    if (task.status !== 'active') {
      throw new BadRequestException('Task is not currently active');
    }

    // Date-based availability
    const now = new Date();
    if (task.startDate && task.startDate > now) {
      throw new BadRequestException('Task is not yet available');
    }
    if (task.endDate && task.endDate < now) {
      throw new BadRequestException('Task submission window has closed');
    }

    // Must have at least one media file
    if (body.mediaFiles.length === 0) {
      throw new BadRequestException('At least one media file is required');
    }

    // Validate collection type matches
    const expectedMediaType = getMediaTypeForCollection(task.collectionType);

    // MIME type validation (skip generic application/octet-stream — mobile may not resolve it)
    const ALLOWED_MIMES: Record<string, string[]> = {
      VIDEO: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/mpeg'],
      AUDIO: ['audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/x-m4a'],
      IMAGE: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'],
    };
    const allowedMimes = ALLOWED_MIMES[expectedMediaType] ?? [];
    for (const file of body.mediaFiles) {
      const mime = file.contentType?.toLowerCase();
      if (!mime || mime === 'application/octet-stream') continue;
      if (!allowedMimes.includes(mime)) {
        throw new BadRequestException(
          `"${file.filename}" has unsupported type "${file.contentType}" for ${task.collectionType} tasks`,
        );
      }
    }

    // Idempotency: clean up any stale DRAFT / UPLOADING / UPLOAD_FAILED records
    // for this user+task so callers can safely retry without accumulating orphans
    await this.prisma.submission.deleteMany({
      where: {
        userId,
        taskId: body.taskId,
        status: { in: ['DRAFT', 'UPLOADING', 'UPLOAD_FAILED'] },
      },
    });

    // Per-user submission limit
    if (task.maxSubmissionsPerUser) {
      const userCount = await this.prisma.submission.count({
        where: {
          userId,
          taskId: body.taskId,
          status: { notIn: ['DRAFT', 'UPLOAD_FAILED'] },
        },
      });
      if (userCount >= task.maxSubmissionsPerUser) {
        throw new BadRequestException(
          `You have reached the maximum of ${task.maxSubmissionsPerUser} submission(s) for this task`,
        );
      }
    }

    // Total submission limit
    if (task.maxTotalSubmissions) {
      const totalCount = await this.prisma.submission.count({
        where: {
          taskId: body.taskId,
          status: { notIn: ['DRAFT', 'UPLOAD_FAILED'] },
        },
      });
      if (totalCount >= task.maxTotalSubmissions) {
        throw new BadRequestException('This task has reached its submission limit');
      }
    }

    // Duration validation
    if (task.collectionType !== 'IMAGE') {
      if (
        body.durationSeconds != null &&
        task.minimumDurationSeconds != null &&
        body.durationSeconds < task.minimumDurationSeconds
      ) {
        throw new BadRequestException(
          `Recording is too short. Minimum ${task.minimumDurationSeconds}s required`,
        );
      }
      if (
        body.durationSeconds != null &&
        task.maximumDurationSeconds != null &&
        body.durationSeconds > task.maximumDurationSeconds
      ) {
        throw new BadRequestException(
          `Recording exceeds maximum duration of ${task.maximumDurationSeconds}s`,
        );
      }
    }

    // Image count validation
    if (task.collectionType === 'IMAGE') {
      const count = body.mediaFiles.length;
      if (task.minimumImageCount && count < task.minimumImageCount) {
        throw new BadRequestException(
          `Minimum ${task.minimumImageCount} image(s) required`,
        );
      }
      if (task.maximumImageCount && count > task.maximumImageCount) {
        throw new BadRequestException(
          `Maximum ${task.maximumImageCount} image(s) allowed`,
        );
      }
    }

    // File size validation
    for (const file of body.mediaFiles) {
      const maxSize = getMaxFileSizeForType(expectedMediaType);
      if (file.fileSize && file.fileSize > maxSize) {
        throw new BadRequestException(
          `File "${file.filename}" exceeds the maximum allowed size`,
        );
      }
    }

    // Compute total file size
    const totalFileSize = body.mediaFiles.reduce(
      (sum, f) => sum + (f.fileSize ?? 0),
      0,
    );

    // Create submission in DRAFT status
    const submission = await this.prisma.submission.create({
      data: {
        userId,
        taskId: body.taskId,
        categoryId: task.categoryId,
        subcategoryId: task.subcategoryId ?? null,
        collectionType: task.collectionType,
        status: 'DRAFT',
        durationSeconds: body.durationSeconds ?? null,
        imageCount: body.mediaFiles.length,
        totalFileSize: totalFileSize > 0 ? BigInt(totalFileSize) : null,
        captureStartedAt: body.captureStartedAt ? new Date(body.captureStartedAt) : null,
        captureEndedAt: body.captureEndedAt ? new Date(body.captureEndedAt) : null,
        captureMetadata: body.captureMetadata ?? undefined,
        taskSnapshot: buildTaskSnapshot(task) as Prisma.InputJsonValue,
        paymentAmountSnapshot: task.paymentAmount,
        currencySnapshot: task.currency,
        devicePlatform: body.devicePlatform ?? null,
        deviceModel: body.deviceModel ?? null,
        osVersion: body.osVersion ?? null,
        cameraUsed: body.cameraUsed ?? null,
        lensRequested: body.lensRequested ?? null,
        orientation: body.orientation ?? null,
      },
    });

    // Generate presigned URLs and create SubmissionMedia rows
    const uploadTargets: Array<{
      mediaId: string;
      storageKey: string;
      uploadUrl: string;
      filename: string;
      sortOrder: number;
    }> = [];

    for (let i = 0; i < body.mediaFiles.length; i++) {
      const file = body.mediaFiles[i]!;
      const mimeType = file.contentType ?? getMimeType(file.filename);
      const ext = file.filename.split('.').pop() ?? 'bin';

      const { uploadURL, objectPath, objectKey } = await this.storage.getUploadUrl({
        submissionId: submission.id,
        index: i,
        ext,
        contentType: mimeType,
      });

      const media = await this.prisma.submissionMedia.create({
        data: {
          submissionId: submission.id,
          mediaType: expectedMediaType,
          storageKey: objectKey,
          mediaUrl: objectPath,
          mimeType,
          sortOrder: i,
          fileSize: file.fileSize ? BigInt(file.fileSize) : null,
          uploadStatus: 'PENDING',
        },
      });

      uploadTargets.push({
        mediaId: media.id,
        storageKey: objectKey,
        uploadUrl: uploadURL,
        filename: file.filename,
        sortOrder: i,
      });
    }

    // Mark as UPLOADING
    await this.prisma.submission.update({
      where: { id: submission.id },
      data: { status: 'UPLOADING', uploadStartedAt: new Date() },
    });

    return {
      submissionId: submission.id,
      uploadTargets,
    };
  }

  // ─── POST /submissions/:id/upload-complete ─────────────────────────────────
  async uploadComplete(
    userId: string,
    submissionId: string,
    body: {
      uploadedMedia: Array<{ mediaId: string; fileSize?: number }>;
    },
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { media: true },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.userId !== userId) throw new ForbiddenException('Access denied');
    if (submission.status !== 'UPLOADING' && submission.status !== 'DRAFT') {
      throw new BadRequestException(
        `Cannot complete upload for submission in status ${submission.status}`,
      );
    }

    // Mark each uploaded media
    for (const uploaded of body.uploadedMedia) {
      await this.prisma.submissionMedia.update({
        where: { id: uploaded.mediaId },
        data: {
          uploadStatus: 'UPLOADED',
          fileSize: uploaded.fileSize ? BigInt(uploaded.fileSize) : undefined,
        },
      });
    }

    // Verify all media uploaded
    const pendingMedia = await this.prisma.submissionMedia.count({
      where: {
        submissionId,
        uploadStatus: { notIn: ['UPLOADED'] },
      },
    });
    if (pendingMedia > 0) {
      throw new BadRequestException(
        `${pendingMedia} media file(s) have not been uploaded yet`,
      );
    }

    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: 'UNDER_REVIEW',
        submittedAt: new Date(),
        uploadCompletedAt: new Date(),
      },
      include: SUBMISSION_INCLUDE,
    });

    return formatSubmission(updated);
  }

  // ─── POST /submissions/:id/upload-failed ───────────────────────────────────
  async uploadFailed(
    userId: string,
    submissionId: string,
    body: { failureReason?: string; failedMediaIds?: string[] },
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.userId !== userId) throw new ForbiddenException('Access denied');

    // Mark failed media
    if (body.failedMediaIds && body.failedMediaIds.length > 0) {
      await this.prisma.submissionMedia.updateMany({
        where: { submissionId, id: { in: body.failedMediaIds } },
        data: { uploadStatus: 'FAILED' },
      });
    }

    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: 'UPLOAD_FAILED',
        failureReason: body.failureReason ?? null,
      },
      include: SUBMISSION_INCLUDE,
    });

    return formatSubmission(updated);
  }

  // ─── GET /submissions/my ───────────────────────────────────────────────────
  async listMine(
    userId: string,
    params: { page?: number; limit?: number; status?: string },
  ) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where: Prisma.SubmissionWhereInput = { userId };
    if (params.status) {
      where.status = params.status as SubmissionStatus;
    }

    const [total, data] = await Promise.all([
      this.prisma.submission.count({ where }),
      this.prisma.submission.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: SUBMISSION_INCLUDE,
      }),
    ]);

    return {
      data: data.map(formatSubmission),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── GET /submissions/my/:id ───────────────────────────────────────────────
  async findMine(userId: string, submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: SUBMISSION_INCLUDE,
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.userId !== userId) throw new ForbiddenException('Access denied');
    return formatSubmission(submission);
  }

  // ─── DELETE /submissions/:id ───────────────────────────────────────────────
  async deleteSubmission(userId: string, submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.userId !== userId) throw new ForbiddenException('Access denied');

    const deletableStatuses: SubmissionStatus[] = ['DRAFT', 'UPLOADING', 'UPLOAD_FAILED'];
    if (!deletableStatuses.includes(submission.status)) {
      throw new BadRequestException(
        `Cannot delete a submission in status ${submission.status}`,
      );
    }

    // SubmissionMedia rows cascade-deleted via schema
    await this.prisma.submission.delete({ where: { id: submissionId } });
    return { deleted: true };
  }

  // ─── Admin: GET /admin/submissions ────────────────────────────────────────
  async adminList(params: {
    page?: number;
    limit?: number;
    status?: string;
    collectionType?: string;
    categoryId?: string;
    subcategoryId?: string;
    userId?: string;
    search?: string;
  }) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.SubmissionWhereInput = {};
    if (params.status) where.status = params.status as SubmissionStatus;
    if (params.collectionType) where.collectionType = params.collectionType as CollectionType;
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.subcategoryId) where.subcategoryId = params.subcategoryId;
    if (params.userId) where.userId = params.userId;
    if (params.search) {
      where.OR = [
        { id: { contains: params.search, mode: 'insensitive' } },
        { user: { phoneNumber: { contains: params.search, mode: 'insensitive' } } },
        {
          taskSnapshot: {
            path: ['title'],
            string_contains: params.search,
          },
        },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.submission.count({ where }),
      this.prisma.submission.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: SUBMISSION_INCLUDE,
      }),
    ]);

    return {
      data: data.map(formatSubmission),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Admin: GET /admin/submissions/:id ────────────────────────────────────
  async adminFindOne(submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: SUBMISSION_INCLUDE,
    });
    if (!submission) throw new NotFoundException('Submission not found');

    const formatted = formatSubmission(submission);

    // Attach short-lived presigned read URLs for each uploaded media item
    const mediaWithUrls = await Promise.all(
      formatted.media.map(async (m) => {
        if (m.uploadStatus !== 'UPLOADED') return m;
        try {
          const readUrl = await this.storage.getReadUrl(m.storageKey);
          return { ...m, readUrl };
        } catch {
          return m;
        }
      }),
    );

    return { ...formatted, media: mediaWithUrls };
  }

  // ─── Admin: POST /admin/submissions/:id/approve ───────────────────────────
  async approve(
    submissionId: string,
    adminEmail: string,
    body: { approvedAmount?: number; adminNote?: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const submission = await tx.submission.findUnique({ where: { id: submissionId } });
      if (!submission) throw new NotFoundException('Submission not found');
      if (submission.status !== 'UNDER_REVIEW') {
        throw new BadRequestException(
          `Only UNDER_REVIEW submissions can be approved (current: ${submission.status})`,
        );
      }

      const amount =
        body.approvedAmount != null
          ? body.approvedAmount
          : (submission.paymentAmountSnapshot as Prisma.Decimal).toNumber();

      const taskTitle =
        (submission.taskSnapshot as Record<string, unknown>)?.title as string ?? submissionId;

      await this.walletService.creditSubmissionApproval(
        tx as Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
        submission.userId,
        submissionId,
        amount,
        taskTitle,
      );

      const updated = await tx.submission.update({
        where: { id: submissionId },
        data: {
          status: 'APPROVED',
          approvedAmount: amount,
          adminNote: body.adminNote ?? null,
          reviewedBy: adminEmail,
          reviewedAt: new Date(),
        },
        include: SUBMISSION_INCLUDE,
      });

      const result = formatSubmission(updated);

      setImmediate(() => {
        void this.notificationsService.dispatch({
          userId: submission.userId,
          title: '✅ Submission Approved',
          body: `Your submission for "${taskTitle}" has been approved. ₦${amount.toFixed(2)} credited to your wallet.`,
          type: NotificationType.SUBMISSION_APPROVED,
          relatedEntityType: NotificationEntityType.SUBMISSION,
          relatedEntityId: submissionId,
          preferenceKey: 'notifySubmissionUpdates',
        });
      });

      return result;
    });
  }

  // ─── Admin: POST /admin/submissions/:id/reject ────────────────────────────
  async reject(
    submissionId: string,
    adminEmail: string,
    body: { rejectionReason: string; adminNote?: string },
  ) {
    const submission = await this.prisma.submission.findUnique({ where: { id: submissionId } });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.status !== 'UNDER_REVIEW') {
      throw new BadRequestException(
        `Only UNDER_REVIEW submissions can be rejected (current: ${submission.status})`,
      );
    }

    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: 'REJECTED',
        rejectionReason: body.rejectionReason,
        adminNote: body.adminNote ?? null,
        reviewedBy: adminEmail,
        reviewedAt: new Date(),
      },
      include: SUBMISSION_INCLUDE,
    });

    const taskTitle =
      (submission.taskSnapshot as Record<string, unknown>)?.title as string ?? submissionId;

    setImmediate(() => {
      void this.notificationsService.dispatch({
        userId: submission.userId,
        title: '❌ Submission Rejected',
        body: `Your submission for "${taskTitle}" was rejected. ${body.rejectionReason}`,
        type: NotificationType.SUBMISSION_REJECTED,
        relatedEntityType: NotificationEntityType.SUBMISSION,
        relatedEntityId: submissionId,
        preferenceKey: 'notifySubmissionUpdates',
      });
    });

    return formatSubmission(updated);
  }

  // ─── Admin: POST /admin/submissions/:id/request-resubmission ─────────────
  async requestResubmission(
    submissionId: string,
    adminEmail: string,
    body: { resubmissionReason: string },
  ) {
    const submission = await this.prisma.submission.findUnique({ where: { id: submissionId } });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.status !== 'UNDER_REVIEW') {
      throw new BadRequestException(
        `Only UNDER_REVIEW submissions can be marked for resubmission (current: ${submission.status})`,
      );
    }

    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: 'RESUBMISSION_REQUIRED',
        resubmissionReason: body.resubmissionReason,
        reviewedBy: adminEmail,
        reviewedAt: new Date(),
      },
      include: SUBMISSION_INCLUDE,
    });

    const taskTitle =
      (submission.taskSnapshot as Record<string, unknown>)?.title as string ?? submissionId;

    setImmediate(() => {
      void this.notificationsService.dispatch({
        userId: submission.userId,
        title: '🔄 Resubmission Required',
        body: `Your submission for "${taskTitle}" needs changes. ${body.resubmissionReason}`,
        type: NotificationType.RESUBMISSION_REQUIRED,
        relatedEntityType: NotificationEntityType.SUBMISSION,
        relatedEntityId: submissionId,
        preferenceKey: 'notifySubmissionUpdates',
      });
    });

    return formatSubmission(updated);
  }
}
