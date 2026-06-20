import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType, NotificationEntityType } from '@prisma/client';

interface ListParams { page?: number; limit?: number; isActive?: boolean }
interface CreateDto { title: string; content: string; isActive?: boolean; startsAt?: string; endsAt?: string }
interface UpdateDto { title?: string; content?: string; isActive?: boolean; startsAt?: string | null; endsAt?: string | null }

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

  async listPublicActive() {
    const now = new Date();
    return this.prisma.notice.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
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
    const notice = await this.prisma.notice.create({
      data: {
        title: dto.title,
        content: dto.content,
        isActive: dto.isActive ?? true,
        startsAt,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });
    const publishNow = (dto.isActive ?? true) && (!startsAt || startsAt <= now);
    if (publishNow) {
      setImmediate(() => {
        void this.notificationsService.broadcast({
          title: `📢 ${notice.title}`,
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
    const updated = await this.prisma.notice.update({
      where: { id },
      data: {
        ...dto,
        startsAt: dto.startsAt !== undefined ? (dto.startsAt ? new Date(dto.startsAt) : null) : undefined,
        endsAt: dto.endsAt !== undefined ? (dto.endsAt ? new Date(dto.endsAt) : null) : undefined,
      },
    });
    const justActivated = dto.isActive === true && !existing.isActive;
    if (justActivated) {
      setImmediate(() => {
        void this.notificationsService.broadcast({
          title: `📢 ${updated.title}`,
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
