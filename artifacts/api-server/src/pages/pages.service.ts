import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveText } from '../categories/categories.service';

interface ListParams { page?: number; limit?: number }
interface CreateDto { title: string; slug: string; content: string; titleEn?: string; titleHi?: string; contentEn?: string; contentHi?: string; isPublished?: boolean }
interface UpdateDto { title?: string; slug?: string; content?: string; titleEn?: string; titleHi?: string; contentEn?: string; contentHi?: string; isPublished?: boolean }

type PageRow = { id: string; title: string; slug: string; content: string; titleEn: string | null; titleHi: string | null; contentEn: string | null; contentHi: string | null; isPublished: boolean; version: number; createdAt: Date; updatedAt: Date };

@Injectable()
export class PagesService {
  constructor(private prisma: PrismaService) {}

  async list(params: ListParams) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;
    const [total, data] = await Promise.all([
      this.prisma.staticPage.count(),
      this.prisma.staticPage.findMany({ skip, take: limit, orderBy: { updatedAt: 'desc' } }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findBySlugPublic(slug: string, language?: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { slug } });
    if (!page || !page.isPublished) throw new NotFoundException('Page not found');
    if (!language) return page;
    const row = page as PageRow;
    return {
      ...row,
      title: resolveText(row.titleEn, row.title, row.titleHi, language),
      content: resolveText(row.contentEn, row.content, row.contentHi, language),
      resolvedLanguage: language === 'hi' && (row.contentHi?.trim()) ? 'hi' : 'en',
    };
  }

  async findOne(id: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Page not found');
    return page;
  }

  async create(dto: CreateDto) {
    const existing = await this.prisma.staticPage.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Slug "${dto.slug}" already exists`);
    const titleEn = dto.titleEn?.trim() || dto.title;
    const contentEn = dto.contentEn?.trim() || dto.content;
    return this.prisma.staticPage.create({
      data: {
        title: titleEn,
        slug: dto.slug,
        content: contentEn,
        titleEn,
        titleHi: dto.titleHi?.trim() || null,
        contentEn,
        contentHi: dto.contentHi?.trim() || null,
        isPublished: dto.isPublished ?? false,
        version: 1,
      },
    });
  }

  async update(id: string, dto: UpdateDto) {
    const page = await this.findOne(id);
    if (dto.slug && dto.slug !== page.slug) {
      const existing = await this.prisma.staticPage.findUnique({ where: { slug: dto.slug } });
      if (existing) throw new ConflictException(`Slug "${dto.slug}" already exists`);
    }
    const data: Record<string, unknown> = { ...dto };
    const row = page as PageRow;
    if (dto.titleEn !== undefined) data.title = dto.titleEn.trim() || row.title;
    if (dto.contentEn !== undefined) {
      data.content = dto.contentEn.trim() || row.content;
      if (dto.contentEn !== row.contentEn) data.version = row.version + 1;
    } else if (dto.content && dto.content !== page.content) {
      data.version = page.version + 1;
    }
    return this.prisma.staticPage.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.staticPage.delete({ where: { id } });
  }
}
