import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PayoutStatus, PaymentMethodVerificationStatus } from '@prisma/client';

const PAYOUT_INCLUDE = {
  paymentMethod: {
    select: { upiId: true, upiIdMasked: true, verificationStatus: true },
  },
};

const ADMIN_PAYOUT_INCLUDE = {
  paymentMethod: {
    select: { upiId: true, upiIdMasked: true, verificationStatus: true },
  },
  user: { select: { id: true, phoneNumber: true, name: true } },
};

type PayoutWithMethod = {
  id: string;
  userId: string;
  paymentMethodId: string;
  amount: { toNumber(): number };
  currency: string;
  status: PayoutStatus;
  requestedAt: Date;
  processingStartedAt: Date | null;
  processedAt: Date | null;
  paidAt: Date | null;
  rejectedAt: Date | null;
  cancelledAt: Date | null;
  processedByAdminId: string | null;
  rejectionReason: string | null;
  adminNote: string | null;
  payoutReferenceId: string | null;
  walletHoldTransactionId: string | null;
  walletCompletionTransactionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  paymentMethod: { upiId: string; upiIdMasked: string; verificationStatus: string } | null;
  user?: { id: string; phoneNumber: string; name: string | null } | null;
};

function formatPayout(p: PayoutWithMethod, revealUpi = false) {
  return {
    id: p.id,
    userId: p.userId,
    paymentMethodId: p.paymentMethodId,
    amount: p.amount.toNumber(),
    currency: p.currency,
    status: p.status,
    upiIdMasked: p.paymentMethod?.upiIdMasked ?? '',
    ...(revealUpi && p.paymentMethod ? { upiId: p.paymentMethod.upiId } : {}),
    upiVerificationStatus: p.paymentMethod?.verificationStatus ?? null,
    requestedAt: p.requestedAt,
    processingStartedAt: p.processingStartedAt,
    processedAt: p.processedAt,
    paidAt: p.paidAt,
    rejectedAt: p.rejectedAt,
    cancelledAt: p.cancelledAt,
    processedByAdminId: p.processedByAdminId,
    rejectionReason: p.rejectionReason,
    adminNote: p.adminNote,
    payoutReferenceId: p.payoutReferenceId,
    walletHoldTransactionId: p.walletHoldTransactionId,
    walletCompletionTransactionId: p.walletCompletionTransactionId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    ...(p.user ? { user: p.user } : {}),
  };
}

@Injectable()
export class PayoutsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private async getPayoutSettings() {
    const [enabled, minAmt, maxAmt, maxPending] = await Promise.all([
      this.prisma.appSetting.findUnique({ where: { key: 'PAYOUT_ENABLED' } }),
      this.prisma.appSetting.findUnique({ where: { key: 'PAYOUT_MIN_AMOUNT' } }),
      this.prisma.appSetting.findUnique({ where: { key: 'PAYOUT_MAX_AMOUNT' } }),
      this.prisma.appSetting.findUnique({ where: { key: 'PAYOUT_MAX_PENDING_PER_USER' } }),
    ]);
    return {
      enabled: enabled?.value !== 'false',
      minAmount: parseFloat(minAmt?.value ?? '100'),
      maxAmount: maxAmt?.value ? parseFloat(maxAmt.value) : null,
      maxPendingPerUser: maxPending?.value ? parseInt(maxPending.value, 10) : null,
    };
  }

  // ─── User: list ─────────────────────────────────────────────────────────────
  async getMyPayouts(
    userId: string,
    params: { page?: number; limit?: number; status?: PayoutStatus },
  ) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { userId };
    if (params.status) where.status = params.status;

    const [total, data] = await Promise.all([
      this.prisma.payoutRequest.count({ where }),
      this.prisma.payoutRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: PAYOUT_INCLUDE,
      }),
    ]);

    return {
      data: data.map((p) => formatPayout(p as PayoutWithMethod, false)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── User: single ────────────────────────────────────────────────────────────
  async getMyPayout(userId: string, payoutId: string) {
    const payout = await this.prisma.payoutRequest.findFirst({
      where: { id: payoutId, userId },
      include: PAYOUT_INCLUDE,
    });
    if (!payout) throw new NotFoundException('Payout request not found');
    return formatPayout(payout as PayoutWithMethod, false);
  }

  // ─── User: create ────────────────────────────────────────────────────────────
  async createPayoutRequest(userId: string, amount: number, paymentMethodId: string) {
    const settings = await this.getPayoutSettings();
    if (!settings.enabled) {
      throw new ForbiddenException('Payouts are currently disabled');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid withdrawal amount');
    }
    if (amount < settings.minAmount) {
      throw new BadRequestException(`Minimum withdrawal amount is ₹${settings.minAmount}`);
    }
    if (settings.maxAmount && amount > settings.maxAmount) {
      throw new BadRequestException(`Maximum withdrawal amount is ₹${settings.maxAmount}`);
    }

    const paymentMethod = await this.prisma.userPaymentMethod.findFirst({
      where: { id: paymentMethodId, userId },
    });
    if (!paymentMethod) throw new NotFoundException('Payment method not found');
    if (paymentMethod.verificationStatus !== PaymentMethodVerificationStatus.VERIFIED) {
      const msg =
        paymentMethod.verificationStatus === PaymentMethodVerificationStatus.PENDING_VERIFICATION
          ? 'Your UPI ID is pending verification. Please wait for admin approval.'
          : 'Your UPI ID has been rejected. Please update your UPI ID.';
      throw new BadRequestException(msg);
    }

    // Idempotency: only one active payout allowed
    const existingActive = await this.prisma.payoutRequest.findFirst({
      where: { userId, status: { in: ['PENDING', 'PROCESSING'] } },
    });
    if (existingActive) {
      throw new ConflictException('You already have an active payout request');
    }

    if (settings.maxPendingPerUser) {
      const pendingCount = await this.prisma.payoutRequest.count({
        where: { userId, status: { in: ['PENDING', 'PROCESSING'] } },
      });
      if (pendingCount >= settings.maxPendingPerUser) {
        throw new BadRequestException(
          `Maximum ${settings.maxPendingPerUser} pending payout requests allowed`,
        );
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new NotFoundException('Wallet not found');

      const available = wallet.availableBalance.toNumber();
      if (amount > available) {
        throw new BadRequestException(
          `Insufficient balance. Available: ₹${available.toFixed(2)}`,
        );
      }

      const newAvailable = available - amount;
      const newPendingWithdrawal = wallet.pendingWithdrawalBalance.toNumber() + amount;

      const holdTx = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          type: 'PAYOUT_HOLD',
          sourceType: 'PAYOUT',
          amount,
          balanceBefore: available,
          balanceAfter: newAvailable,
          note: `Withdrawal hold: ₹${amount.toFixed(2)}`,
          status: 'COMPLETED',
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: newAvailable,
          pendingWithdrawalBalance: newPendingWithdrawal,
        },
      });

      const payout = await tx.payoutRequest.create({
        data: {
          userId,
          paymentMethodId,
          amount,
          walletHoldTransactionId: holdTx.id,
        },
        include: PAYOUT_INCLUDE,
      });

      await tx.walletTransaction.update({
        where: { id: holdTx.id },
        data: { sourceId: payout.id },
      });

      return payout;
    });

    await this.audit.log('payout.requested', {}, {
      entityType: 'PayoutRequest',
      entityId: result.id,
      metadata: { userId, amount, paymentMethodId, upiIdMasked: paymentMethod.upiIdMasked },
    });

    return formatPayout(result as PayoutWithMethod, false);
  }

  // ─── User: cancel ────────────────────────────────────────────────────────────
  async cancelPayout(userId: string, payoutId: string) {
    const payout = await this.prisma.payoutRequest.findFirst({
      where: { id: payoutId, userId },
    });
    if (!payout) throw new NotFoundException('Payout request not found');
    if (payout.status !== 'PENDING') {
      throw new BadRequestException('Only PENDING payout requests can be cancelled');
    }

    const amount = payout.amount.toNumber();

    const result = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new NotFoundException('Wallet not found');

      const newAvailable = wallet.availableBalance.toNumber() + amount;
      const newPendingWithdrawal = Math.max(
        0,
        wallet.pendingWithdrawalBalance.toNumber() - amount,
      );

      const reversalTx = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          type: 'PAYOUT_REVERSED',
          sourceType: 'PAYOUT',
          sourceId: payoutId,
          amount,
          balanceBefore: wallet.availableBalance.toNumber(),
          balanceAfter: newAvailable,
          note: `Withdrawal cancelled: ₹${amount.toFixed(2)} returned`,
          status: 'COMPLETED',
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: newAvailable,
          pendingWithdrawalBalance: newPendingWithdrawal,
        },
      });

      return tx.payoutRequest.update({
        where: { id: payoutId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          walletCompletionTransactionId: reversalTx.id,
        },
        include: PAYOUT_INCLUDE,
      });
    });

    await this.audit.log('payout.cancelled', {}, {
      entityType: 'PayoutRequest',
      entityId: payoutId,
      metadata: { userId, amount },
    });

    return formatPayout(result as PayoutWithMethod, false);
  }

  // ─── Admin: list ─────────────────────────────────────────────────────────────
  async adminListPayouts(params: {
    page?: number;
    limit?: number;
    status?: PayoutStatus;
    upiVerificationStatus?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
    minAmount?: number;
    maxAmount?: number;
  }) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};

    if (params.status) where.status = params.status;
    if (params.upiVerificationStatus) {
      where.paymentMethod = { verificationStatus: params.upiVerificationStatus };
    }
    if (params.minAmount !== undefined || params.maxAmount !== undefined) {
      const amtFilter: Record<string, number> = {};
      if (params.minAmount !== undefined) amtFilter.gte = params.minAmount;
      if (params.maxAmount !== undefined) amtFilter.lte = params.maxAmount;
      where.amount = amtFilter;
    }
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
        { id: { contains: params.search, mode: 'insensitive' } },
        { user: { phoneNumber: { contains: params.search, mode: 'insensitive' } } },
        { user: { id: { contains: params.search, mode: 'insensitive' } } },
        { paymentMethod: { upiIdMasked: { contains: params.search, mode: 'insensitive' } } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.payoutRequest.count({ where }),
      this.prisma.payoutRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: ADMIN_PAYOUT_INCLUDE,
      }),
    ]);

    return {
      data: data.map((p) => formatPayout(p as PayoutWithMethod, false)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Admin: single ────────────────────────────────────────────────────────────
  async adminGetPayout(payoutId: string, revealUpi = false) {
    const payout = await this.prisma.payoutRequest.findUnique({
      where: { id: payoutId },
      include: ADMIN_PAYOUT_INCLUDE,
    });
    if (!payout) throw new NotFoundException('Payout request not found');
    return formatPayout(payout as PayoutWithMethod, revealUpi);
  }

  // ─── Admin: start-processing ─────────────────────────────────────────────────
  async adminStartProcessing(payoutId: string, adminId: string, adminEmail: string) {
    const payout = await this.prisma.payoutRequest.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout request not found');
    if (payout.status !== 'PENDING') {
      throw new BadRequestException('Only PENDING payouts can be moved to PROCESSING');
    }

    const updated = await this.prisma.payoutRequest.update({
      where: { id: payoutId },
      data: {
        status: 'PROCESSING',
        processingStartedAt: new Date(),
        processedByAdminId: adminId,
      },
      include: ADMIN_PAYOUT_INCLUDE,
    });

    await this.audit.log('payout.processing_started', { adminId, adminEmail }, {
      entityType: 'PayoutRequest',
      entityId: payoutId,
      metadata: { amount: payout.amount.toNumber(), userId: payout.userId },
    });

    return formatPayout(updated as PayoutWithMethod, false);
  }

  // ─── Admin: mark-paid ────────────────────────────────────────────────────────
  async adminMarkPaid(
    payoutId: string,
    adminId: string,
    adminEmail: string,
    payoutReferenceId: string,
    adminNote?: string,
  ) {
    const payout = await this.prisma.payoutRequest.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout request not found');
    if (payout.status !== 'PROCESSING') {
      throw new BadRequestException('Only PROCESSING payouts can be marked as paid');
    }
    if (payout.walletCompletionTransactionId) {
      throw new ConflictException('Payout already marked as paid');
    }

    const amount = payout.amount.toNumber();
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: payout.userId } });
      if (!wallet) throw new NotFoundException('Wallet not found');

      const newPendingWithdrawal = Math.max(
        0,
        wallet.pendingWithdrawalBalance.toNumber() - amount,
      );
      const newTotalWithdrawn = wallet.totalWithdrawn.toNumber() + amount;

      const completionTx = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId: payout.userId,
          type: 'PAYOUT_COMPLETED',
          sourceType: 'PAYOUT',
          sourceId: payoutId,
          amount,
          balanceBefore: wallet.pendingWithdrawalBalance.toNumber(),
          balanceAfter: newPendingWithdrawal,
          note: `Payout paid: ₹${amount.toFixed(2)} (ref: ${payoutReferenceId})`,
          status: 'COMPLETED',
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          pendingWithdrawalBalance: newPendingWithdrawal,
          totalWithdrawn: newTotalWithdrawn,
        },
      });

      return tx.payoutRequest.update({
        where: { id: payoutId },
        data: {
          status: 'PAID',
          paidAt: now,
          processedAt: now,
          processedByAdminId: adminId,
          payoutReferenceId,
          adminNote: adminNote ?? payout.adminNote,
          walletCompletionTransactionId: completionTx.id,
        },
        include: ADMIN_PAYOUT_INCLUDE,
      });
    });

    await this.audit.log('payout.mark_paid', { adminId, adminEmail }, {
      entityType: 'PayoutRequest',
      entityId: payoutId,
      metadata: { amount, payoutReferenceId, userId: payout.userId },
    });

    return formatPayout(result as PayoutWithMethod, false);
  }

  // ─── Admin: reject ────────────────────────────────────────────────────────────
  async adminRejectPayout(
    payoutId: string,
    adminId: string,
    adminEmail: string,
    rejectionReason: string,
    adminNote?: string,
  ) {
    const payout = await this.prisma.payoutRequest.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout request not found');
    if (!['PENDING', 'PROCESSING'].includes(payout.status)) {
      throw new BadRequestException('Only PENDING or PROCESSING payouts can be rejected');
    }

    const amount = payout.amount.toNumber();
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: payout.userId } });
      if (!wallet) throw new NotFoundException('Wallet not found');

      const newAvailable = wallet.availableBalance.toNumber() + amount;
      const newPendingWithdrawal = Math.max(
        0,
        wallet.pendingWithdrawalBalance.toNumber() - amount,
      );

      const reversalTx = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId: payout.userId,
          type: 'PAYOUT_REVERSED',
          sourceType: 'PAYOUT',
          sourceId: payoutId,
          amount,
          balanceBefore: wallet.availableBalance.toNumber(),
          balanceAfter: newAvailable,
          note: `Payout rejected: ₹${amount.toFixed(2)} returned`,
          status: 'COMPLETED',
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: newAvailable,
          pendingWithdrawalBalance: newPendingWithdrawal,
        },
      });

      return tx.payoutRequest.update({
        where: { id: payoutId },
        data: {
          status: 'REJECTED',
          rejectedAt: now,
          processedAt: now,
          processedByAdminId: adminId,
          rejectionReason,
          adminNote: adminNote ?? payout.adminNote,
          walletCompletionTransactionId: reversalTx.id,
        },
        include: ADMIN_PAYOUT_INCLUDE,
      });
    });

    await this.audit.log('payout.rejected', { adminId, adminEmail }, {
      entityType: 'PayoutRequest',
      entityId: payoutId,
      metadata: { amount, rejectionReason, userId: payout.userId },
    });

    return formatPayout(result as PayoutWithMethod, false);
  }
}
