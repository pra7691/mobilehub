import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface ListParams { page?: number; limit?: number; search?: string; categoryId?: string; isActive?: boolean }
interface CreateDto { name: string; description?: string; categoryId: string; displayOrder?: number; isActive?: boolean }
interface UpdateDto { name?: string; description?: string; categoryId?: string; displayOrder?: number; isActive?: boolean }

@Injectable()
export class SubcategoriesService {
  constructor(private prisma: PrismaService) {}

  private async toResponse(sub: { id: string; name: string; description: string | null; categoryId: string; displayOrder: number; isActive: boolean; createdAt: Date; updatedAt: Date }) {
    const [taskCount, category] = await Promise.all([
      this.prisma.task.count({ where: { subcategoryId: sub.id, deletedAt: null } }),
      this.prisma.category.findUnique({ where: { id: sub.categoryId }, select: { id: true, name: true, icon: true, isActive: true } }),
    ]);
    return { ...sub, taskCount, category };
  }

  async list(params: ListParams) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.search) where.name = { contains: params.search, mode: 'insensitive' };
    if (params.isActive !== undefined) where.isActive = params.isActive;
    const [total, data] = await Promise.all([
      this.prisma.subcategory.count({ where }),
      this.prisma.subcategory.findMany({ where, skip, take: limit, orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] }),
    ]);
    const enriched = await Promise.all(data.map((s) => this.toResponse(s)));
    return { data: enriched, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const sub = await this.prisma.subcategory.findFirst({ where: { id, deletedAt: null } });
    if (!sub) throw new NotFoundException('Subcategory not found');
    return this.toResponse(sub);
  }

  async create(dto: CreateDto) {
    const category = await this.prisma.category.findFirst({ where: { id: dto.categoryId, deletedAt: null, isActive: true } });
    if (!category) throw new BadRequestException('Category not found or not active');
    const sub = await this.prisma.subcategory.create({ data: { ...dto, isActive: dto.isActive ?? true, displayOrder: dto.displayOrder ?? 0 } });
    return this.toResponse(sub);
  }

  async update(id: string, dto: UpdateDto) {
    await this.findOne(id);
    if (dto.categoryId) {
      const category = await this.prisma.category.findFirst({ where: { id: dto.categoryId, deletedAt: null } });
      if (!category) throw new BadRequestException('Category not found');
    }
    const sub = await this.prisma.subcategory.update({ where: { id }, data: dto });
    return this.toResponse(sub);
  }

  async remove(id: string) {
    await this.findOne(id);
    const activeTasks = await this.prisma.task.count({ where: { subcategoryId: id, deletedAt: null, status: 'active' } });
    if (activeTasks > 0) throw new BadRequestException(`Cannot delete: ${activeTasks} active task(s) exist. Deactivate them first.`);
    await this.prisma.subcategory.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
