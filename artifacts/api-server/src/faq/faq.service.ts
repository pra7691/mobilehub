import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveText } from '../categories/categories.service';

interface ListParams { page?: number; limit?: number; search?: string; isActive?: boolean }
interface CreateDto { question: string; answer: string; questionEn?: string; questionHi?: string; answerEn?: string; answerHi?: string; displayOrder?: number; isActive?: boolean }
interface UpdateDto { question?: string; answer?: string; questionEn?: string; questionHi?: string; answerEn?: string; answerHi?: string; displayOrder?: number; isActive?: boolean }

type FaqRow = { id: string; question: string; answer: string; questionEn: string | null; questionHi: string | null; answerEn: string | null; answerHi: string | null; displayOrder: number; isActive: boolean; createdAt: Date; updatedAt: Date };

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

  async listPublic(search?: string, language?: string) {
    const where: Record<string, unknown> = { deletedAt: null, isActive: true };
    if (search) {
      where.OR = [
        { question: { contains: search, mode: 'insensitive' } },
        { answer: { contains: search, mode: 'insensitive' } },
      ];
    }
    const data = await this.prisma.faq.findMany({ where, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] });
    return data.map((f) => {
      const row = f as FaqRow;
      return {
        ...row,
        question: resolveText(row.questionEn, row.question, row.questionHi, language),
        answer: resolveText(row.answerEn, row.answer, row.answerHi, language),
      };
    });
  }

  async findOne(id: string) {
    const faq = await this.prisma.faq.findFirst({ where: { id, deletedAt: null } });
    if (!faq) throw new NotFoundException('FAQ not found');
    return faq;
  }

  async create(dto: CreateDto) {
    const questionEn = dto.questionEn?.trim() || dto.question;
    const answerEn = dto.answerEn?.trim() || dto.answer;
    return this.prisma.faq.create({
      data: {
        question: questionEn,
        answer: answerEn,
        questionEn,
        questionHi: dto.questionHi?.trim() || null,
        answerEn,
        answerHi: dto.answerHi?.trim() || null,
        isActive: dto.isActive ?? true,
        displayOrder: dto.displayOrder ?? 0,
      },
    });
  }

  async update(id: string, dto: UpdateDto) {
    const existing = await this.findOne(id);
    const updateData: Record<string, unknown> = { ...dto };
    if (dto.questionEn !== undefined) updateData.question = dto.questionEn.trim() || existing.question;
    if (dto.answerEn !== undefined) updateData.answer = dto.answerEn.trim() || existing.answer;
    return this.prisma.faq.update({ where: { id }, data: updateData });
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
