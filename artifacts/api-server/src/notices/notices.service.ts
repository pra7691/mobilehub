import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType, NotificationEntityType } from '@prisma/client';
import { resolveText } from '../categories/categories.service';

interface ListParams { page?: number; limit?: number; isActive?: boolean }
interface CreateDto { title: string; content: string; titleEn?: string; titleHi?: string; contentEn?: string; contentHi?: string; isActive?: boolean; startsAt?: string; endsAt?: string }
interface UpdateDto { title?: string; content?: string; titleEn?: string; titleHi?: string; contentEn?: string; contentHi?: string; isActive?: boolean; startsAt?: string | null; endsAt?: string | null }

type NoticeRow = { id: string; title: string; content: string; titleEn: string | null; titleHi: string | null; contentEn: string | null; contentHi: string | null; isActive: boolean; startsAt: Date | null; endsAt: Date | null; createdAt: Date; updatedAt: Date };

@Injectable()
export class NoticesService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async list(params: ListParams) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.isActive !== undefined) where.isActive = params.isActive;
    const [total, data] = await Promise.all([
      this.prisma.notice.count({ where }),
      this.prisma.notice.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async listPublicActive(language?: string) {
    const now = new Date();
    const notices = await this.prisma.notice.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!language) return notices;
    return notices.map((n) => {
      const row = n as NoticeRow;
      return {
        ...row,
        title: resolveText(row.titleEn, row.title, row.titleHi, language),
        content: resolveText(row.contentEn, row.content, row.contentHi, language),
      };
    });
  }

  async findOne(id: string) {
    const notice = await this.prisma.notice.findFirst({ where: { id, deletedAt: null } });
    if (!notice) throw new NotFoundException('Notice not found');
    return notice;
  }

  async create(dto: CreateDto) {
    const now = new Date();
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const titleEn = dto.titleEn?.trim() || dto.title;
    const contentEn = dto.contentEn?.trim() || dto.content;
    const notice = await this.prisma.notice.create({
      data: {
        title: titleEn,
        content: contentEn,
        titleEn,
        titleHi: dto.titleHi?.trim() || null,
        contentEn,
        contentHi: dto.contentHi?.trim() || null,
        isActive: dto.isActive ?? true,
        startsAt,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });
    const publishNow = (dto.isActive ?? true) && (!startsAt || startsAt <= now);
    if (publishNow) {
      setImmediate(() => {
        void this.notificationsService.broadcast({
          title: notice.title,
          body: notice.content.length > 100 ? notice.content.slice(0, 97) + '…' : notice.content,
          type: NotificationType.APP_NOTICE,
          relatedEntityType: NotificationEntityType.NOTICE,
          relatedEntityId: notice.id,
          preferenceKey: 'notifyAppNotices',
        });
      });
    }
    return notice;
  }

  async update(id: string, dto: UpdateDto) {
    const existing = await this.findOne(id);
    const updateData: Record<string, unknown> = {
      ...dto,
      startsAt: dto.startsAt !== undefined ? (dto.startsAt ? new Date(dto.startsAt) : null) : undefined,
      endsAt: dto.endsAt !== undefined ? (dto.endsAt ? new Date(dto.endsAt) : null) : undefined,
    };
    if (dto.titleEn !== undefined) updateData.title = dto.titleEn.trim() || existing.title;
    if (dto.contentEn !== undefined) updateData.content = dto.contentEn.trim() || existing.content;
    const updated = await this.prisma.notice.update({ where: { id }, data: updateData });
    const justActivated = dto.isActive === true && !existing.isActive;
    if (justActivated) {
      setImmediate(() => {
        void this.notificationsService.broadcast({
          title: updated.title,
          body: updated.content.length > 100 ? updated.content.slice(0, 97) + '…' : updated.content,
          type: NotificationType.APP_NOTICE,
          relatedEntityType: NotificationEntityType.NOTICE,
          relatedEntityId: id,
          preferenceKey: 'notifyAppNotices',
        });
      });
    }
    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.notice.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
