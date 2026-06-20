import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatus } from '@prisma/client';

interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: UserStatus;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private toResponse(user: { id: string; phoneNumber: string; name: string | null; status: UserStatus; createdAt: Date; updatedAt: Date; submissions?: { rewardAmount: { toNumber(): number } }[] }) {
    const totalEarnings = user.submissions?.reduce((sum, s) => sum + s.rewardAmount.toNumber(), 0) ?? 0;
    const totalSubmissions = user.submissions?.length ?? 0;
    return {
      id: user.id,
      phoneNumber: user.phoneNumber,
      name: user.name,
      status: user.status,
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
        include: { submissions: { select: { rewardAmount: true } } },
      }),
    ]);

    return {
      data: data.map(this.toResponse),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { submissions: { select: { rewardAmount: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.toResponse(user);
  }

  async update(id: string, data: { name?: string; status?: UserStatus }) {
    await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data,
      include: { submissions: { select: { rewardAmount: true } } },
    });
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
