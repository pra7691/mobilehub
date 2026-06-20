import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface ListParams { page?: number; limit?: number }
interface CreateDto { title: string; slug: string; content: string; isPublished?: boolean }
interface UpdateDto { title?: string; slug?: string; content?: string; isPublished?: boolean }

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

  async findBySlugPublic(slug: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { slug } });
    if (!page || !page.isPublished) throw new NotFoundException('Page not found');
    return page;
  }

  async findOne(id: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Page not found');
    return page;
  }

  async create(dto: CreateDto) {
    const existing = await this.prisma.staticPage.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Slug "${dto.slug}" already exists`);
    return this.prisma.staticPage.create({ data: { ...dto, isPublished: dto.isPublished ?? false, version: 1 } });
  }

  async update(id: string, dto: UpdateDto) {
    const page = await this.findOne(id);
    if (dto.slug && dto.slug !== page.slug) {
      const existing = await this.prisma.staticPage.findUnique({ where: { slug: dto.slug } });
      if (existing) throw new ConflictException(`Slug "${dto.slug}" already exists`);
    }
    const data: Record<string, unknown> = { ...dto };
    if (dto.content && dto.content !== page.content) data.version = page.version + 1;
    return this.prisma.staticPage.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.staticPage.delete({ where: { id } });
  }
}
