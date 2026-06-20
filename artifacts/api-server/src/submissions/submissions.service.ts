import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubmissionStatus } from '@prisma/client';

interface ListParams { page?: number; limit?: number; taskId?: string; userId?: string; status?: SubmissionStatus }

@Injectable()
export class SubmissionsService {
  constructor(private prisma: PrismaService) {}

  private toResponse(s: {
    id: string;
    taskId: string;
    userId: string;
    status: SubmissionStatus;
    reviewNote: string | null;
    rewardAmount: { toNumber(): number };
    mediaUrls: string[];
    createdAt: Date;
    updatedAt: Date;
    task?: object | null;
    user?: object | null;
  }) {
    return { ...s, rewardAmount: s.rewardAmount.toNumber() };
  }

  async list(params: ListParams) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    if (params.taskId) where.taskId = params.taskId;
    if (params.userId) where.userId = params.userId;
    if (params.status) where.status = params.status;

    const [total, data] = await Promise.all([
      this.prisma.submission.count({ where }),
      this.prisma.submission.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          task: { select: { id: true, title: true, collectionType: true, paymentAmount: true, status: true } },
          user: { select: { id: true, phoneNumber: true, name: true, status: true } },
        },
      }),
    ]);
    return { data: data.map(s => this.toResponse(s)), meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async create(userId: string, taskId: string, mediaUrls: string[]) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    const s = await this.prisma.submission.create({
      data: {
        taskId,
        userId,
        status: 'pending',
        rewardAmount: task.paymentAmount,
        mediaUrls,
      },
      include: {
        task: { select: { id: true, title: true, collectionType: true, paymentAmount: true, status: true } },
        user: { select: { id: true, phoneNumber: true, name: true, status: true } },
      },
    });
    return this.toResponse(s);
  }

  async findOne(id: string) {
    const s = await this.prisma.submission.findUnique({
      where: { id },
      include: {
        task: { select: { id: true, title: true, collectionType: true, paymentAmount: true, status: true } },
        user: { select: { id: true, phoneNumber: true, name: true, status: true } },
      },
    });
    if (!s) throw new NotFoundException('Submission not found');
    return this.toResponse(s);
  }

  async updateStatus(id: string, status: SubmissionStatus, reviewNote?: string) {
    await this.findOne(id);
    const s = await this.prisma.submission.update({
      where: { id },
      data: { status, reviewNote },
      include: {
        task: { select: { id: true, title: true, collectionType: true, paymentAmount: true, status: true } },
        user: { select: { id: true, phoneNumber: true, name: true, status: true } },
      },
    });
    return this.toResponse(s);
  }
}
