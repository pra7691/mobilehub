import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
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

const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_#^()\-+=\[\]{}|;:,.<>?])[A-Za-z\d@$!%*?&_#^()\-+=\[\]{}|;:,.<>?]{8,}$/;

function validateStrongPassword(password: string) {
  if (password.length < 8) {
    throw new BadRequestException('Password must be at least 8 characters');
  }
  if (!STRONG_PASSWORD_REGEX.test(password)) {
    throw new BadRequestException(
      'Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character',
    );
  }
}

@Injectable()
export class AdminUsersService {
  constructor(private prisma: PrismaService) {}

  private sanitize(user: {
    id: string;
    email: string;
    name: string;
    role: AdminRole;
    isActive: boolean;
    tokenVersion: number;
    createdAt: Date;
    updatedAt: Date;
    password?: string;
    deletedAt?: Date | null;
  }) {
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
      data: data.map((u) => this.sanitize(u)),
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
    validateStrongPassword(dto.password);
    const password = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.adminUser.create({
      data: { ...dto, password },
    });
    return this.sanitize(user);
  }

  async update(id: string, dto: UpdateAdminUserDto) {
    await this.findOne(id);
    const data: Record<string, unknown> = { ...dto };
    if (dto.password) {
      validateStrongPassword(dto.password);
      data.password = await bcrypt.hash(dto.password, 12);
    }
    const user = await this.prisma.adminUser.update({ where: { id }, data });
    return this.sanitize(user);
  }

  async changePassword(
    id: string,
    body: { currentPassword: string; newPassword: string },
  ) {
    const user = await this.prisma.adminUser.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('Admin user not found');

    const valid = await bcrypt.compare(body.currentPassword, user.password);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    validateStrongPassword(body.newPassword);

    if (body.newPassword === body.currentPassword) {
      throw new BadRequestException('New password must differ from current password');
    }

    const hashed = await bcrypt.hash(body.newPassword, 12);
    await this.prisma.adminUser.update({
      where: { id },
      data: { password: hashed, tokenVersion: { increment: 1 } },
    });

    return { message: 'Password changed successfully' };
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.adminUser.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
