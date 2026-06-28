import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionType, CameraPreference, LensPreference, OrientationRequirement, TaskStatus, NotificationType, NotificationEntityType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { Decimal } from '@prisma/client/runtime/library';
import { resolveText, resolveOptional } from '../categories/categories.service';

interface ListParams {
  page?: number; limit?: number; search?: string; categoryId?: string;
  subcategoryId?: string; status?: TaskStatus; collectionType?: CollectionType;
  language?: string;
}

interface TaskDto {
  title?: string; description?: string; detailedInstructions?: string;
  titleEn?: string; titleHi?: string; shortDescriptionEn?: string; shortDescriptionHi?: string;
  detailedInstructionsEn?: string; detailedInstructionsHi?: string;
  dosEn?: string[]; dosHi?: string[]; dontsEn?: string[]; dontsHi?: string[];
  dos?: string[]; donts?: string[]; categoryId?: string; subcategoryId?: string;
  collectionType?: CollectionType; paymentAmount?: number; currency?: string;
  sampleMediaUrl?: string; minimumDurationSeconds?: number; maximumDurationSeconds?: number;
  minimumImageCount?: number; maximumImageCount?: number; preferredFps?: number;
  minimumFps?: number; preferredCamera?: CameraPreference; preferredLens?: LensPreference;
  requiredOrientation?: OrientationRequirement; audioRequired?: boolean; pauseAllowed?: boolean;
  recordImu?: boolean; imuRequired?: boolean;
  maxSubmissionsPerUser?: number; maxTotalSubmissions?: number;
  startDate?: string; endDate?: string; displayOrder?: number; status?: TaskStatus;
}

type TaskRow = {
  id: string; title: string; description: string | null; detailedInstructions: string | null;
  titleEn: string | null; titleHi: string | null;
  shortDescriptionEn: string | null; shortDescriptionHi: string | null;
  detailedInstructionsEn: string | null; detailedInstructionsHi: string | null;
  dosEn: string[]; dosHi: string[]; dontsEn: string[]; dontsHi: string[];
  dos: string[]; donts: string[]; categoryId: string; subcategoryId: string | null;
  collectionType: CollectionType; paymentAmount: Decimal; currency: string;
  sampleMediaUrl: string | null; minimumDurationSeconds: number | null; maximumDurationSeconds: number | null;
  minimumImageCount: number | null; maximumImageCount: number | null; preferredFps: number | null;
  minimumFps: number | null; preferredCamera: CameraPreference; preferredLens: LensPreference;
  requiredOrientation: OrientationRequirement; audioRequired: boolean; pauseAllowed: boolean;
  recordImu: boolean; imuRequired: boolean;
  maxSubmissionsPerUser: number | null; maxTotalSubmissions: number | null;
  startDate: Date | null; endDate: Date | null; displayOrder: number; status: TaskStatus;
  createdAt: Date; updatedAt: Date; deletedAt: Date | null;
};

function resolveArray(enArr: string[], hiArr: string[], lang?: string): string[] {
  if (!lang || lang === 'en') return enArr.length ? enArr : [];
  if (lang === 'hi') return hiArr.length ? hiArr : enArr;
  return enArr;
}

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  private async toResponse(task: TaskRow, language?: string) {
    const [submissionCount, category, subcategory] = await Promise.all([
      this.prisma.submission.count({ where: { taskId: task.id } }),
      this.prisma.category.findUnique({ where: { id: task.categoryId }, select: { id: true, name: true, icon: true, isActive: true } }),
      task.subcategoryId ? this.prisma.subcategory.findUnique({ where: { id: task.subcategoryId }, select: { id: true, name: true, isActive: true } }) : Promise.resolve(null),
    ]);
    return {
      ...task,
      title: resolveText(task.titleEn, task.title, task.titleHi, language),
      description: resolveOptional(task.shortDescriptionEn, task.description, task.shortDescriptionHi, language),
      detailedInstructions: resolveOptional(task.detailedInstructionsEn, task.detailedInstructions, task.detailedInstructionsHi, language),
      dos: language ? resolveArray(task.dosEn, task.dosHi, language) : task.dos,
      donts: language ? resolveArray(task.dontsEn, task.dontsHi, language) : task.donts,
      paymentAmount: Number(task.paymentAmount),
      submissionCount,
      category,
      subcategory,
    };
  }

  async list(params: ListParams) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.subcategoryId) where.subcategoryId = params.subcategoryId;
    if (params.status) where.status = params.status;
    if (params.collectionType) where.collectionType = params.collectionType;
    if (params.search) where.title = { contains: params.search, mode: 'insensitive' };

    const [total, data] = await Promise.all([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({ where, skip, take: limit, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }] }),
    ]);
    const enriched = await Promise.all(data.map((t) => this.toResponse(t as TaskRow, params.language)));
    return { data: enriched, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, language?: string) {
    const task = await this.prisma.task.findFirst({ where: { id, deletedAt: null } });
    if (!task) throw new NotFoundException('Task not found');
    return this.toResponse(task as TaskRow, language);
  }

  async create(dto: TaskDto & { title: string; categoryId: string }) {
    const category = await this.prisma.category.findFirst({ where: { id: dto.categoryId, deletedAt: null } });
    if (!category) throw new BadRequestException('Category not found');
    if (dto.subcategoryId) {
      const sub = await this.prisma.subcategory.findFirst({ where: { id: dto.subcategoryId, deletedAt: null, categoryId: dto.categoryId } });
      if (!sub) throw new BadRequestException('Subcategory not found or does not belong to this category');
    }
    const titleEn = dto.titleEn?.trim() || dto.title;
    const task = await this.prisma.task.create({
      data: {
        title: titleEn,
        description: dto.shortDescriptionEn?.trim() || dto.description,
        detailedInstructions: dto.detailedInstructionsEn?.trim() || dto.detailedInstructions,
        titleEn,
        titleHi: dto.titleHi?.trim() || null,
        shortDescriptionEn: dto.shortDescriptionEn?.trim() || dto.description || null,
        shortDescriptionHi: dto.shortDescriptionHi?.trim() || null,
        detailedInstructionsEn: dto.detailedInstructionsEn?.trim() || dto.detailedInstructions || null,
        detailedInstructionsHi: dto.detailedInstructionsHi?.trim() || null,
        dos: dto.dosEn?.length ? dto.dosEn : (dto.dos ?? []),
        donts: dto.dontsEn?.length ? dto.dontsEn : (dto.donts ?? []),
        dosEn: dto.dosEn ?? dto.dos ?? [],
        dosHi: dto.dosHi ?? [],
        dontsEn: dto.dontsEn ?? dto.donts ?? [],
        dontsHi: dto.dontsHi ?? [],
        categoryId: dto.categoryId,
        subcategoryId: dto.subcategoryId,
        collectionType: dto.collectionType ?? CollectionType.IMAGE,
        paymentAmount: dto.paymentAmount ?? 0,
        currency: dto.currency ?? 'INR',
        sampleMediaUrl: dto.sampleMediaUrl,
        minimumDurationSeconds: dto.minimumDurationSeconds,
        maximumDurationSeconds: dto.maximumDurationSeconds,
        minimumImageCount: dto.minimumImageCount,
        maximumImageCount: dto.maximumImageCount,
        preferredFps: dto.preferredFps,
        minimumFps: dto.minimumFps,
        preferredCamera: dto.preferredCamera ?? CameraPreference.ANY,
        preferredLens: dto.preferredLens ?? LensPreference.ANY,
        requiredOrientation: dto.requiredOrientation ?? OrientationRequirement.ANY,
        audioRequired: dto.audioRequired ?? false,
        pauseAllowed: dto.pauseAllowed ?? true,
        recordImu: dto.recordImu ?? false,
        imuRequired: dto.imuRequired ?? false,
        maxSubmissionsPerUser: dto.maxSubmissionsPerUser,
        maxTotalSubmissions: dto.maxTotalSubmissions,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        displayOrder: dto.displayOrder ?? 0,
        status: dto.status ?? TaskStatus.draft,
      },
    });
    return this.toResponse(task as TaskRow);
  }

  async update(id: string, dto: TaskDto) {
    const existing = await this.prisma.task.findFirst({
      where: { id, deletedAt: null },
      select: { status: true, title: true },
    });
    if (!existing) throw new NotFoundException('Task not found');

    const updateData: Record<string, unknown> = { ...dto };
    if (dto.startDate) updateData.startDate = new Date(dto.startDate);
    if (dto.endDate) updateData.endDate = new Date(dto.endDate);
    if (dto.titleEn !== undefined) updateData.title = dto.titleEn.trim() || existing.title;
    if (dto.shortDescriptionEn !== undefined) updateData.description = dto.shortDescriptionEn.trim() || null;
    if (dto.detailedInstructionsEn !== undefined) updateData.detailedInstructions = dto.detailedInstructionsEn.trim() || null;
    if (dto.dosEn !== undefined) updateData.dos = dto.dosEn;
    if (dto.dontsEn !== undefined) updateData.donts = dto.dontsEn;

    const task = await this.prisma.task.update({ where: { id }, data: updateData });
    const result = await this.toResponse(task as TaskRow);

    if (dto.status === TaskStatus.active && existing.status !== TaskStatus.active) {
      setImmediate(() => {
        void this.notificationsService.broadcast({
          title: 'New Task Available',
          body: `"${existing.title}" is now available. Open the app to start collecting!`,
          type: NotificationType.NEW_TASK,
          relatedEntityType: NotificationEntityType.TASK,
          relatedEntityId: id,
          preferenceKey: 'notifyNewTasks',
        });
      });
    }

    return result;
  }

  async duplicate(id: string) {
    const original = await this.prisma.task.findFirst({ where: { id, deletedAt: null } });
    if (!original) throw new NotFoundException('Task not found');
    const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...rest } = original;
    const copy = await this.prisma.task.create({
      data: { ...rest, title: `${rest.title} (Copy)`, status: TaskStatus.draft, displayOrder: rest.displayOrder + 1 },
    });
    return this.toResponse(copy as TaskRow);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
