import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskStatus } from '@prisma/client';

interface ListParams { page?: number; limit?: number; search?: string; categoryId?: string; subcategoryId?: string; status?: TaskStatus }
interface CreateDto { title: string; description?: string; instructions?: string; categoryId: string; subcategoryId?: string; reward: number; status?: TaskStatus }
interface UpdateDto { title?: string; description?: string; instructions?: string; categoryId?: string; subcategoryId?: string; reward?: number; status?: TaskStatus }

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  private async toResponse(task: { id: string; title: string; description: string | null; instructions: string | null; categoryId: string; subcategoryId: string | null; reward: { toNumber(): number }; status: TaskStatus; createdAt: Date; updatedAt: Date }) {
    const [submissionCount, category, subcategory] = await Promise.all([
      this.prisma.submission.count({ where: { taskId: task.id } }),
      this.prisma.category.findUnique({ where: { id: task.categoryId } }),
      task.subcategoryId ? this.prisma.subcategory.findUnique({ where: { id: task.subcategoryId } }) : Promise.resolve(null),
    ]);
    return { ...task, reward: task.reward.toNumber(), submissionCount, category, subcategory };
  }

  async list(params: ListParams) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.subcategoryId) where.subcategoryId = params.subcategoryId;
    if (params.status) where.status = params.status;
    if (params.search) where.title = { contains: params.search, mode: 'insensitive' };

    const [total, data] = await Promise.all([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    ]);
    const enriched = await Promise.all(data.map(t => this.toResponse(t)));
    return { data: enriched, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findFirst({ where: { id, deletedAt: null } });
    if (!task) throw new NotFoundException('Task not found');
    return this.toResponse(task);
  }

  async create(dto: CreateDto) {
    const task = await this.prisma.task.create({ data: { ...dto, status: dto.status ?? TaskStatus.draft } });
    return this.toResponse(task);
  }

  async update(id: string, dto: UpdateDto) {
    await this.findOne(id);
    const task = await this.prisma.task.update({ where: { id }, data: dto });
    return this.toResponse(task);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
