import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationEntityType, NotificationType, Prisma, UserStatus } from '@prisma/client';
import { ExpoPushService } from './expo-push.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDeviceDto, UpdatePreferencesDto } from './dto/register-device.dto';

type PreferenceKey = 'notifySubmissionUpdates' | 'notifyNewTasks' | 'notifyAppNotices';

export interface DispatchPayload {
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  relatedEntityType?: NotificationEntityType;
  relatedEntityId?: string;
  preferenceKey?: PreferenceKey;
}

export interface BroadcastPayload {
  title: string;
  body: string;
  type: NotificationType;
  relatedEntityType?: NotificationEntityType;
  relatedEntityId?: string;
  preferenceKey?: PreferenceKey;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expoPush: ExpoPushService,
  ) {}

  // ─── Device Registration ───────────────────────────────────────────────────

  async registerDevice(userId: string, dto: RegisterDeviceDto) {
    return this.prisma.deviceToken.upsert({
      where: { userId_expoPushToken: { userId, expoPushToken: dto.expoPushToken } },
      create: {
        userId,
        expoPushToken: dto.expoPushToken,
        platform: dto.platform,
        deviceId: dto.deviceId ?? null,
        notifySubmissionUpdates: dto.notifySubmissionUpdates ?? true,
        notifyNewTasks: dto.notifyNewTasks ?? true,
        notifyAppNotices: dto.notifyAppNotices ?? true,
        lastSeenAt: new Date(),
      },
      update: {
        platform: dto.platform,
        deviceId: dto.deviceId ?? undefined,
        isActive: true,
        notifySubmissionUpdates: dto.notifySubmissionUpdates ?? undefined,
        notifyNewTasks: dto.notifyNewTasks ?? undefined,
        notifyAppNotices: dto.notifyAppNotices ?? undefined,
        lastSeenAt: new Date(),
      },
    });
  }

  async unregisterDevice(userId: string, expoPushToken: string) {
    await this.prisma.deviceToken.updateMany({
      where: { userId, expoPushToken },
      data: { isActive: false },
    });
    return { success: true };
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    const token = await this.prisma.deviceToken.findFirst({
      where: { userId, expoPushToken: dto.expoPushToken },
    });
    if (!token) throw new NotFoundException('Device token not found');

    return this.prisma.deviceToken.update({
      where: { id: token.id },
      data: {
        notifySubmissionUpdates: dto.notifySubmissionUpdates ?? undefined,
        notifyNewTasks: dto.notifyNewTasks ?? undefined,
        notifyAppNotices: dto.notifyAppNotices ?? undefined,
        lastSeenAt: new Date(),
      },
    });
  }

  // ─── User Notifications ────────────────────────────────────────────────────

  async listMy(userId: string, params: { page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(params.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where: Prisma.NotificationWhereInput = { userId };
    const [total, data] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async markRead(userId: string, notificationId: string) {
    const notif = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notif || notif.userId !== userId) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  // ─── Dispatch (single user) ────────────────────────────────────────────────

  async dispatch(payload: DispatchPayload): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: { status: true, deletedAt: true },
    });
    if (!user || user.status !== UserStatus.active || user.deletedAt) return;

    const notification = await this.prisma.notification.create({
      data: {
        userId: payload.userId,
        title: payload.title,
        body: payload.body,
        type: payload.type,
        relatedEntityType: payload.relatedEntityType ?? null,
        relatedEntityId: payload.relatedEntityId ?? null,
      },
    });

    // Fire-and-forget — queue-ready: swap setImmediate for a BullMQ job in production
    setImmediate(() => {
      void this.sendPush(
        notification.id,
        payload.userId,
        payload.title,
        payload.body,
        payload.type,
        payload.relatedEntityType ?? null,
        payload.relatedEntityId ?? null,
        payload.preferenceKey,
      );
    });
  }

  // ─── Broadcast (all active users with preference) ─────────────────────────

  async broadcast(payload: BroadcastPayload): Promise<void> {
    const filter: Prisma.DeviceTokenWhereInput = {
      isActive: true,
      user: { status: UserStatus.active, deletedAt: null },
    };
    if (payload.preferenceKey) {
      filter[payload.preferenceKey] = true;
    }

    const distinctUsers = await this.prisma.deviceToken.findMany({
      where: filter,
      select: { userId: true },
      distinct: ['userId'],
    });

    for (const { userId } of distinctUsers) {
      void this.dispatch({ ...payload, userId });
    }
  }

  // ─── Admin List ────────────────────────────────────────────────────────────

  async adminList(params: {
    page?: number;
    limit?: number;
    type?: string;
    userId?: string;
    isRead?: boolean;
    from?: string;
    to?: string;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(params.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {};
    if (params.type) where.type = params.type as NotificationType;
    if (params.userId) where.userId = params.userId;
    if (params.isRead !== undefined) where.isRead = params.isRead;
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(params.from);
      if (params.to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(params.to);
    }

    const [total, data] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, phoneNumber: true, name: true } },
        },
      }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ─── Private: send push to active device tokens ────────────────────────────

  private async sendPush(
    notificationId: string,
    userId: string,
    title: string,
    body: string,
    type: NotificationType,
    relatedEntityType: NotificationEntityType | null,
    relatedEntityId: string | null,
    preferenceKey?: PreferenceKey,
  ): Promise<void> {
    try {
      const filter: Prisma.DeviceTokenWhereInput = { userId, isActive: true };
      if (preferenceKey) filter[preferenceKey] = true;

      const tokens = await this.prisma.deviceToken.findMany({
        where: filter,
        select: { id: true, expoPushToken: true },
      });

      if (tokens.length === 0) {
        await this.prisma.notification.update({
          where: { id: notificationId },
          data: { sentAt: new Date(), deliveryError: 'no_active_tokens' },
        });
        return;
      }

      const messages = tokens.map((t) => ({
        to: t.expoPushToken,
        title,
        body,
        sound: 'default' as const,
        data: {
          type,
          relatedEntityType: relatedEntityType ?? undefined,
          relatedEntityId: relatedEntityId ?? undefined,
          notificationId,
        },
      }));

      const tickets = await this.expoPush.sendMany(messages);

      const errors: string[] = [];
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        const token = tokens[i];
        if (!ticket || !token) continue;
        if (ticket.status === 'error') {
          errors.push(`${token.expoPushToken.slice(0, 20)}…: ${ticket.message ?? 'error'}`);
          if (ticket.details?.error === 'DeviceNotRegistered') {
            await this.prisma.deviceToken
              .update({ where: { id: token.id }, data: { isActive: false } })
              .catch(() => {});
          }
        }
      }

      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          sentAt: new Date(),
          deliveryError: errors.length > 0 ? errors.join('; ') : null,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      await this.prisma.notification
        .update({ where: { id: notificationId }, data: { deliveryError: msg } })
        .catch(() => {});
    }
  }
}
