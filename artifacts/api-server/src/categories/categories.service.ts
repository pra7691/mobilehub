import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface ListParams { page?: number; limit?: number; search?: string; isActive?: boolean }
interface CreateDto { name: string; description?: string; icon?: string; coverImageUrl?: string; displayOrder?: number; isActive?: boolean }
interface UpdateDto { name?: string; description?: string; icon?: string; coverImageUrl?: string; displayOrder?: number; isActive?: boolean }

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  private async toResponse(cat: { id: string; name: string; description: string | null; icon: string | null; coverImageUrl: string | null; displayOrder: number; isActive: boolean; createdAt: Date; updatedAt: Date }) {
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
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.search) where.name = { contains: params.search, mode: 'insensitive' };
    if (params.isActive !== undefined) where.isActive = params.isActive;
    const [total, data] = await Promise.all([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({ where, skip, take: limit, orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] }),
    ]);
    const enriched = await Promise.all(data.map((c) => this.toResponse(c)));
    return { data: enriched, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const cat = await this.prisma.category.findFirst({ where: { id, deletedAt: null } });
    if (!cat) throw new NotFoundException('Category not found');
    return this.toResponse(cat);
  }

  async create(dto: CreateDto) {
    const cat = await this.prisma.category.create({ data: { ...dto, isActive: dto.isActive ?? true, displayOrder: dto.displayOrder ?? 0 } });
    return this.toResponse(cat);
  }

  async update(id: string, dto: UpdateDto) {
    await this.findOne(id);
    const cat = await this.prisma.category.update({ where: { id }, data: dto });
    return this.toResponse(cat);
  }

  async remove(id: string) {
    await this.findOne(id);
    const [activeSubcats, activeTasks] = await Promise.all([
      this.prisma.subcategory.count({ where: { categoryId: id, deletedAt: null, isActive: true } }),
      this.prisma.task.count({ where: { categoryId: id, deletedAt: null, status: 'active' } }),
    ]);
    if (activeSubcats > 0) throw new BadRequestException(`Cannot delete: ${activeSubcats} active subcategory(ies) exist. Deactivate them first.`);
    if (activeTasks > 0) throw new BadRequestException(`Cannot delete: ${activeTasks} active task(s) exist. Deactivate them first.`);
    await this.prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
