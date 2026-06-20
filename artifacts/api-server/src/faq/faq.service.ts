import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface ListParams { page?: number; limit?: number; search?: string; isActive?: boolean }
interface CreateDto { question: string; answer: string; displayOrder?: number; isActive?: boolean }
interface UpdateDto { question?: string; answer?: string; displayOrder?: number; isActive?: boolean }

@Injectable()
export class FaqService {
  constructor(private prisma: PrismaService) {}

  async listAdmin(params: ListParams) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.search) {
      where.OR = [
        { question: { contains: params.search, mode: 'insensitive' } },
        { answer: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.isActive !== undefined) where.isActive = params.isActive;
    const [total, data] = await Promise.all([
      this.prisma.faq.count({ where }),
      this.prisma.faq.findMany({ where, skip, take: limit, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async listPublic(search?: string) {
    const where: Record<string, unknown> = { deletedAt: null, isActive: true };
    if (search) {
      where.OR = [
        { question: { contains: search, mode: 'insensitive' } },
        { answer: { contains: search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.faq.findMany({ where, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  async findOne(id: string) {
    const faq = await this.prisma.faq.findFirst({ where: { id, deletedAt: null } });
    if (!faq) throw new NotFoundException('FAQ not found');
    return faq;
  }

  async create(dto: CreateDto) {
    return this.prisma.faq.create({
      data: { ...dto, isActive: dto.isActive ?? true, displayOrder: dto.displayOrder ?? 0 },
    });
  }

  async update(id: string, dto: UpdateDto) {
    await this.findOne(id);
    return this.prisma.faq.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.faq.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async reorder(items: { id: string; displayOrder: number }[]) {
    await Promise.all(
      items.map(({ id, displayOrder }) => this.prisma.faq.update({ where: { id }, data: { displayOrder } })),
    );
  }
}
