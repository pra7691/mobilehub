import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuditAction =
  | 'admin.login'
  | 'admin.logout'
  | 'admin.logout_all'
  | 'admin.password_changed'
  | 'admin.created'
  | 'admin.updated'
  | 'admin.deleted'
  | 'task.created'
  | 'task.updated'
  | 'task.deleted'
  | 'task.status_changed'
  | 'submission.reviewed'
  | 'otp_settings.updated'
  | 'support_settings.updated'
  | 'static_page.updated'
  | 'notice.created'
  | 'notice.updated'
  | 'notice.deleted'
  | 'user.status_changed';

export interface AuditContext {
  adminId?: string;
  adminEmail?: string;
  ipAddress?: string;
  requestId?: string;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(
    action: AuditAction,
    ctx: AuditContext,
    meta?: { entityType?: string; entityId?: string; metadata?: Record<string, unknown> },
  ) {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          adminId: ctx.adminId ?? null,
          adminEmail: ctx.adminEmail ?? null,
          action,
          entityType: meta?.entityType ?? null,
          entityId: meta?.entityId ?? null,
          metadata: meta?.metadata !== undefined ? (meta.metadata as Prisma.InputJsonValue) : undefined,
          ipAddress: ctx.ipAddress ?? null,
          requestId: ctx.requestId ?? null,
        },
      });
    } catch {
      // Audit logging must never break the main flow
    }
  }

  async listLogs(params: {
    adminId?: string;
    action?: string;
    entityType?: string;
    page?: number;
    limit?: number;
    from?: string;
    to?: string;
  }) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (params.adminId) where['adminId'] = params.adminId;
    if (params.action) where['action'] = { contains: params.action, mode: 'insensitive' };
    if (params.entityType) where['entityType'] = params.entityType;
    if (params.from || params.to) {
      where['createdAt'] = {
        ...(params.from && { gte: new Date(params.from) }),
        ...(params.to && { lte: new Date(params.to) }),
      };
    }

    const [total, data] = await Promise.all([
      this.prisma.adminAuditLog.count({ where }),
      this.prisma.adminAuditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { admin: { select: { id: true, email: true, name: true } } },
      }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
