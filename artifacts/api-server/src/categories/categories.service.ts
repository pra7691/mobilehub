import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface ListParams { page?: number; limit?: number; search?: string }
interface CreateDto { name: string; description?: string; isActive?: boolean }
interface UpdateDto { name?: string; description?: string; isActive?: boolean }

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  private async toResponse(cat: { id: string; name: string; description: string | null; isActive: boolean; createdAt: Date; updatedAt: Date }) {
    const [subcategoryCount, taskCount] = await Promise.all([
      this.prisma.subcategory.count({ where: { categoryId: cat.id, deletedAt: null } }),
      this.prisma.task.count({ where: { categoryId: cat.id, deletedAt: null } }),
    ]);
    return { ...cat, subcategoryCount, taskCount };
  }

  async list(params: ListParams) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = params.search
      ? { deletedAt: null, name: { contains: params.search, mode: 'insensitive' as const } }
      : { deletedAt: null };

    const [total, data] = await Promise.all([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
    ]);

    const enriched = await Promise.all(data.map(c => this.toResponse(c)));
    return { data: enriched, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const cat = await this.prisma.category.findFirst({ where: { id, deletedAt: null } });
    if (!cat) throw new NotFoundException('Category not found');
    return this.toResponse(cat);
  }

  async create(dto: CreateDto) {
    const cat = await this.prisma.category.create({ data: { ...dto, isActive: dto.isActive ?? true } });
    return this.toResponse(cat);
  }

  async update(id: string, dto: UpdateDto) {
    await this.findOne(id);
    const cat = await this.prisma.category.update({ where: { id }, data: dto });
    return this.toResponse(cat);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
