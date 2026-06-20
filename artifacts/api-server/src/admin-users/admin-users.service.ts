import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AdminRole } from '@prisma/client';

interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
}

interface CreateAdminUserDto {
  email: string;
  name: string;
  password: string;
  role: AdminRole;
}

interface UpdateAdminUserDto {
  name?: string;
  role?: AdminRole;
  isActive?: boolean;
  password?: string;
}

@Injectable()
export class AdminUsersService {
  constructor(private prisma: PrismaService) {}

  private sanitize(user: { id: string; email: string; name: string; role: AdminRole; isActive: boolean; createdAt: Date; updatedAt: Date; password?: string; deletedAt?: Date | null }) {
    const { password: _pw, deletedAt: _dt, ...rest } = user;
    void _pw; void _dt;
    return rest;
  }

  async list(params: ListParams) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = params.search
      ? {
          AND: [
            { deletedAt: null },
            {
              OR: [
                { name: { contains: params.search, mode: 'insensitive' as const } },
                { email: { contains: params.search, mode: 'insensitive' as const } },
              ],
            },
          ],
        }
      : { deletedAt: null };

    const [total, data] = await Promise.all([
      this.prisma.adminUser.count({ where }),
      this.prisma.adminUser.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: data.map(this.sanitize),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.adminUser.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('Admin user not found');
    return this.sanitize(user);
  }

  async create(dto: CreateAdminUserDto) {
    const existing = await this.prisma.adminUser.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const password = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.adminUser.create({
      data: { ...dto, password },
    });
    return this.sanitize(user);
  }

  async update(id: string, dto: UpdateAdminUserDto) {
    await this.findOne(id);
    const data: Record<string, unknown> = { ...dto };
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 10);
    }
    const user = await this.prisma.adminUser.update({ where: { id }, data });
    return this.sanitize(user);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.adminUser.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
