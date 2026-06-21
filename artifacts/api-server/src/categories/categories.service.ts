import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export function resolveText(enField: string | null | undefined, fallback: string, hiField: string | null | undefined, lang?: string): string {
  if (!lang) return fallback;
  if (lang === 'hi') return hiField?.trim() || enField?.trim() || fallback;
  return enField?.trim() || fallback;
}

export function resolveOptional(enField: string | null | undefined, fallback: string | null, hiField: string | null | undefined, lang?: string): string | null {
  if (!lang) return fallback;
  if (!fallback && !enField && !hiField) return null;
  if (lang === 'hi') return hiField?.trim() || enField?.trim() || fallback || null;
  return enField?.trim() || fallback || null;
}

interface ListParams { page?: number; limit?: number; search?: string; isActive?: boolean; language?: string }
interface CreateDto { name: string; description?: string; nameEn?: string; nameHi?: string; descriptionEn?: string; descriptionHi?: string; icon?: string; coverImageUrl?: string; displayOrder?: number; isActive?: boolean }
interface UpdateDto { name?: string; description?: string; nameEn?: string; nameHi?: string; descriptionEn?: string; descriptionHi?: string; icon?: string; coverImageUrl?: string; displayOrder?: number; isActive?: boolean }

type CatRow = { id: string; name: string; description: string | null; nameEn: string | null; nameHi: string | null; descriptionEn: string | null; descriptionHi: string | null; icon: string | null; coverImageUrl: string | null; displayOrder: number; isActive: boolean; createdAt: Date; updatedAt: Date };

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  private async toResponse(cat: CatRow, language?: string) {
    const [subcategoryCount, taskCount] = await Promise.all([
      this.prisma.subcategory.count({ where: { categoryId: cat.id, deletedAt: null } }),
      this.prisma.task.count({ where: { categoryId: cat.id, deletedAt: null } }),
    ]);
    return {
      ...cat,
      name: resolveText(cat.nameEn, cat.name, cat.nameHi, language),
      description: resolveOptional(cat.descriptionEn, cat.description, cat.descriptionHi, language),
      subcategoryCount,
      taskCount,
    };
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
    const enriched = await Promise.all(data.map((c) => this.toResponse(c as CatRow, params.language)));
    return { data: enriched, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, language?: string) {
    const cat = await this.prisma.category.findFirst({ where: { id, deletedAt: null } });
    if (!cat) throw new NotFoundException('Category not found');
    return this.toResponse(cat as CatRow, language);
  }

  async create(dto: CreateDto) {
    const nameEn = dto.nameEn?.trim() || dto.name;
    const cat = await this.prisma.category.create({
      data: {
        name: nameEn,
        description: dto.description,
        nameEn,
        nameHi: dto.nameHi?.trim() || null,
        descriptionEn: dto.descriptionEn?.trim() || dto.description || null,
        descriptionHi: dto.descriptionHi?.trim() || null,
        icon: dto.icon,
        coverImageUrl: dto.coverImageUrl,
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    return this.toResponse(cat as CatRow);
  }

  async update(id: string, dto: UpdateDto) {
    const existing = await this.findOne(id);
    const updateData: Record<string, unknown> = { ...dto };
    if (dto.nameEn !== undefined) {
      updateData.name = dto.nameEn.trim() || existing.name;
    }
    if (dto.name !== undefined && dto.nameEn === undefined) {
      updateData.nameEn = dto.name;
    }
    const cat = await this.prisma.category.update({ where: { id }, data: updateData });
    return this.toResponse(cat as CatRow);
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
