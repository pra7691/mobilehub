import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionType } from '@prisma/client';

interface ListTxParams { page?: number; limit?: number; userId?: string; type?: TransactionType }

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  async getByUserId(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return {
      id: wallet.id,
      userId: wallet.userId,
      balance: wallet.balance.toNumber(),
      totalEarned: wallet.totalEarned.toNumber(),
      totalWithdrawn: wallet.totalWithdrawn.toNumber(),
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  }

  async listTransactions(params: ListTxParams) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    if (params.userId) where.userId = params.userId;
    if (params.type) where.type = params.type;

    const [total, data] = await Promise.all([
      this.prisma.walletTransaction.count({ where }),
      this.prisma.walletTransaction.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, phoneNumber: true, name: true } } },
      }),
    ]);

    return {
      data: data.map(t => ({ ...t, amount: t.amount.toNumber() })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getTransaction(id: string) {
    const t = await this.prisma.walletTransaction.findUnique({
      where: { id },
      include: { user: { select: { id: true, phoneNumber: true, name: true } } },
    });
    if (!t) throw new NotFoundException('Transaction not found');
    return { ...t, amount: t.amount.toNumber() };
  }
}
