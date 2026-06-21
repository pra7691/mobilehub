import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateErrorLogDto {
  errorType: string;
  errorCode?: string;
  message: string;
  stackTrace?: string;
  endpoint?: string;
  httpMethod?: string;
  httpStatus?: number;
  requestId?: string;
  platform: string;
  deviceModel?: string;
  osVersion?: string;
  appVersion?: string;
  networkState?: string;
  collectionType?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class MobileErrorLogsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string | null, dto: CreateErrorLogDto) {
    const record = await this.prisma.mobileErrorLog.create({
      data: {
        userId: userId ?? null,
        errorType: dto.errorType,
        errorCode: dto.errorCode ?? null,
        message: dto.message.slice(0, 2000),
        stackTrace: dto.stackTrace ? dto.stackTrace.slice(0, 8000) : null,
        endpoint: dto.endpoint ?? null,
        httpMethod: dto.httpMethod ?? null,
        httpStatus: dto.httpStatus ?? null,
        requestId: dto.requestId ?? null,
        platform: dto.platform,
        deviceModel: dto.deviceModel ?? null,
        osVersion: dto.osVersion ?? null,
        appVersion: dto.appVersion ?? null,
        networkState: dto.networkState ?? null,
        collectionType: dto.collectionType ?? null,
        metadata: (dto.metadata ?? {}) as object,
      },
    });
    return { id: record.id };
  }

  async list(params: {
    page: number;
    limit: number;
    resolved?: boolean;
    errorType?: string;
    platform?: string;
    userId?: string;
  }) {
    const { page, limit, resolved, errorType, platform, userId } = params;
    const skip = (page - 1) * limit;

    const where = {
      ...(resolved === true ? { resolvedAt: { not: null } } : {}),
      ...(resolved === false ? { resolvedAt: null } : {}),
      ...(errorType ? { errorType } : {}),
      ...(platform ? { platform } : {}),
      ...(userId ? { userId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.mobileErrorLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          userId: true,
          errorType: true,
          errorCode: true,
          message: true,
          endpoint: true,
          httpStatus: true,
          platform: true,
          appVersion: true,
          networkState: true,
          collectionType: true,
          createdAt: true,
          resolvedAt: true,
          resolvedBy: true,
          user: { select: { id: true, phoneNumber: true, name: true } },
        },
      }),
      this.prisma.mobileErrorLog.count({ where }),
    ]);

    return {
      items: items.map((i) => ({
        ...i,
        createdAt: i.createdAt.toISOString(),
        resolvedAt: i.resolvedAt?.toISOString() ?? null,
        user: i.user ?? null,
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getOne(id: string) {
    const record = await this.prisma.mobileErrorLog.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, phoneNumber: true, name: true } },
      },
    });
    if (!record) throw new NotFoundException('Error log not found');
    return {
      ...record,
      metadata: record.metadata as Record<string, unknown>,
      createdAt: record.createdAt.toISOString(),
      resolvedAt: record.resolvedAt?.toISOString() ?? null,
      user: record.user ?? null,
    };
  }

  async resolve(id: string, resolvedBy: string, resolutionNote?: string) {
    const record = await this.prisma.mobileErrorLog.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Error log not found');

    const updated = await this.prisma.mobileErrorLog.update({
      where: { id },
      data: {
        resolvedAt: new Date(),
        resolvedBy,
        resolutionNote: resolutionNote ?? null,
      },
    });
    return {
      ...updated,
      metadata: updated.metadata as Record<string, unknown>,
      createdAt: updated.createdAt.toISOString(),
      resolvedAt: updated.resolvedAt?.toISOString() ?? null,
    };
  }

  async unresolve(id: string) {
    const record = await this.prisma.mobileErrorLog.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Error log not found');

    const updated = await this.prisma.mobileErrorLog.update({
      where: { id },
      data: { resolvedAt: null, resolvedBy: null, resolutionNote: null },
    });
    return {
      ...updated,
      metadata: updated.metadata as Record<string, unknown>,
      createdAt: updated.createdAt.toISOString(),
      resolvedAt: null,
    };
  }
}
