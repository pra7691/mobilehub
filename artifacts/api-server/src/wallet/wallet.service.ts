import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionType, TransactionSourceType, TransactionStatus } from '@prisma/client';

export interface ListTxParams {
  page?: number;
  limit?: number;
  userId?: string;
  type?: TransactionType;
  sourceType?: TransactionSourceType;
  status?: TransactionStatus;
  search?: string;
  sourceId?: string;
  fromDate?: string;
  toDate?: string;
}

function formatWallet(w: {
  id: string;
  userId: string;
  availableBalance: { toNumber(): number };
  pendingBalance: { toNumber(): number };
  pendingWithdrawalBalance: { toNumber(): number };
  lifetimeEarnings: { toNumber(): number };
  totalWithdrawn: { toNumber(): number };
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: w.id,
    userId: w.userId,
    availableBalance: w.availableBalance.toNumber(),
    pendingBalance: w.pendingBalance.toNumber(),
    pendingWithdrawalBalance: w.pendingWithdrawalBalance.toNumber(),
    lifetimeEarnings: w.lifetimeEarnings.toNumber(),
    totalWithdrawn: w.totalWithdrawn.toNumber(),
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

function formatTransaction(t: {
  id: string;
  walletId: string;
  userId: string;
  type: TransactionType;
  sourceType: TransactionSourceType;
  sourceId: string | null;
  amount: { toNumber(): number };
  balanceBefore: { toNumber(): number };
  balanceAfter: { toNumber(): number };
  note: string | null;
  status: TransactionStatus;
  createdAt: Date;
  user?: { id: string; phoneNumber: string; name: string | null } | null;
}) {
  return {
    ...t,
    amount: t.amount.toNumber(),
    balanceBefore: t.balanceBefore.toNumber(),
    balanceAfter: t.balanceAfter.toNumber(),
  };
}

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  async getOrCreateByUserId(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({ data: { userId } });
    }
    return formatWallet(wallet);
  }

  async getByUserId(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return formatWallet(wallet);
  }

  async listTransactions(params: ListTxParams) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (params.userId) where.userId = params.userId;
    if (params.type) where.type = params.type;
    if (params.sourceType) where.sourceType = params.sourceType;
    if (params.status) where.status = params.status;
    if (params.sourceId) where.sourceId = params.sourceId;

    if (params.fromDate || params.toDate) {
      const dateFilter: Record<string, Date> = {};
      if (params.fromDate) dateFilter.gte = new Date(params.fromDate);
      if (params.toDate) {
        const d = new Date(params.toDate);
        d.setHours(23, 59, 59, 999);
        dateFilter.lte = d;
      }
      where.createdAt = dateFilter;
    }

    if (params.search) {
      where.OR = [
        { sourceId: { contains: params.search, mode: 'insensitive' } },
        { user: { phoneNumber: { contains: params.search, mode: 'insensitive' } } },
        { user: { id: { contains: params.search, mode: 'insensitive' } } },
        { note: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.walletTransaction.count({ where }),
      this.prisma.walletTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, phoneNumber: true, name: true } } },
      }),
    ]);

    return {
      data: data.map(formatTransaction),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getTransaction(id: string) {
    const t = await this.prisma.walletTransaction.findUnique({
      where: { id },
      include: { user: { select: { id: true, phoneNumber: true, name: true } } },
    });
    if (!t) throw new NotFoundException('Transaction not found');
    return formatTransaction(t);
  }

  async listUserTransactions(userId: string, params: { page?: number; limit?: number; type?: TransactionType }) {
    return this.listTransactions({ ...params, userId });
  }

  /** Called inside a Prisma transaction to atomically credit a wallet */
  async creditSubmissionApproval(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    userId: string,
    submissionId: string,
    amount: number,
    taskTitle: string,
  ) {
    let wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await tx.wallet.create({ data: { userId } });
    }

    const balanceBefore = wallet.availableBalance.toNumber();
    const balanceAfter = balanceBefore + amount;

    const txRecord = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        userId,
        type: 'CREDIT',
        sourceType: 'SUBMISSION',
        sourceId: submissionId,
        amount,
        balanceBefore,
        balanceAfter,
        note: `Approved: ${taskTitle}`,
        status: 'COMPLETED',
      },
    });

    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        availableBalance: balanceAfter,
        lifetimeEarnings: { increment: amount },
      },
    });

    return txRecord;
  }
}
