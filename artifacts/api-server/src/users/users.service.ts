import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserStatus } from '@prisma/client';

interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: UserStatus;
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  private toResponse(user: {
    id: string;
    phoneNumber: string;
    name: string | null;
    preferredLanguage: string;
    status: UserStatus;
    referralCode?: string | null;
    referredByUserId?: string | null;
    referralAppliedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
    submissions?: { paymentAmountSnapshot: { toNumber(): number } }[];
    referralReceived?: { referralCode: string } | null;
  }) {
    const totalEarnings =
      user.submissions?.reduce(
        (sum, s) => sum + s.paymentAmountSnapshot.toNumber(),
        0
      ) ?? 0;
    const totalSubmissions = user.submissions?.length ?? 0;
    return {
      id: user.id,
      phoneNumber: user.phoneNumber,
      name: user.name,
      preferredLanguage: user.preferredLanguage,
      status: user.status,
      referralCode: user.referralCode ?? null,
      referredByCode: user.referralReceived?.referralCode ?? null,
      referredByUserId: user.referredByUserId ?? null,
      referralAppliedAt: user.referralAppliedAt ?? null,
      totalEarnings,
      totalSubmissions,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async list(params: ListParams) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { deletedAt: null };
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { phoneNumber: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          submissions: { select: { paymentAmountSnapshot: true } },
          referralReceived: { select: { referralCode: true } },
        },
      }),
    ]);

    return {
      data: data.map(u => this.toResponse(u)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        submissions: { select: { paymentAmountSnapshot: true } },
        referralReceived: { select: { referralCode: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.toResponse(user);
  }

  async update(id: string, data: { name?: string; status?: UserStatus }) {
    await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data,
      include: {
        submissions: { select: { paymentAmountSnapshot: true } },
        referralReceived: { select: { referralCode: true } },
      },
    });
    return this.toResponse(user);
  }

  async updateLanguage(id: string, preferredLanguage: string) {
    if (!['en', 'hi'].includes(preferredLanguage)) {
      throw new BadRequestException('preferredLanguage must be "en" or "hi"');
    }
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');
    const updated = await this.prisma.user.update({
      where: { id },
      data: { preferredLanguage },
      include: {
        submissions: { select: { paymentAmountSnapshot: true } },
        referralReceived: { select: { referralCode: true } },
      },
    });
    return this.toResponse(updated);
  }

  async updateStatus(
    id: string,
    status: UserStatus,
    adminEmail: string,
    adminId?: string,
  ) {
    const existing = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('User not found');

    const user = await this.prisma.user.update({
      where: { id },
      data: { status },
      include: {
        submissions: { select: { paymentAmountSnapshot: true } },
        referralReceived: { select: { referralCode: true } },
      },
    });

    await this.auditService.log(
      'user.status_changed',
      { adminId, adminEmail },
      {
        entityType: 'user',
        entityId: id,
        metadata: { previousStatus: existing.status, newStatus: status },
      },
    );

    return this.toResponse(user);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
