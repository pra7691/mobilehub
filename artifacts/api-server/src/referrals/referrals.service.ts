import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WalletService } from '../wallet/wallet.service';
import { ReferralSettingsService } from '../referral-settings/referral-settings.service';

/** Generate a random 6-digit numeric referral code */
export function generateReferralCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Generate a unique referral code, retrying on collision (up to 10 attempts) */
export async function generateUniqueReferralCode(
  prisma: PrismaService,
): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateReferralCode();
    const existing = await prisma.user.findUnique({ where: { referralCode: code } });
    if (!existing) return code;
  }
  throw new Error('Failed to generate unique referral code after 10 attempts');
}

/** Mask a phone number: show last 4 digits, replace rest with * */
function maskPhone(phone: string): string {
  if (phone.length <= 4) return '****';
  return '*'.repeat(phone.length - 4) + phone.slice(-4);
}

function formatReferral(r: {
  id: string;
  referrerUserId: string;
  referredUserId: string;
  referralCode: string;
  status: string;
  registeredAt: Date;
  qualifiedAt: Date | null;
  rewardedAt: Date | null;
  rewardAmount: { toNumber(): number } | null;
  rewardWalletTransactionId: string | null;
  firstQualifiedSubmissionId: string | null;
  note: string | null;
  createdBySystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  referrer?: { id: string; phoneNumber: string; name: string | null } | null;
  referred?: { id: string; phoneNumber: string; name: string | null } | null;
}) {
  return {
    ...r,
    rewardAmount: r.rewardAmount ? r.rewardAmount.toNumber() : null,
    referrer: r.referrer
      ? { ...r.referrer, phoneNumberMasked: maskPhone(r.referrer.phoneNumber) }
      : undefined,
    referred: r.referred
      ? { ...r.referred, phoneNumberMasked: maskPhone(r.referred.phoneNumber) }
      : undefined,
  };
}

const REFERRAL_INCLUDE = {
  referrer: { select: { id: true, phoneNumber: true, name: true } },
  referred: { select: { id: true, phoneNumber: true, name: true } },
};

@Injectable()
export class ReferralsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private walletService: WalletService,
    private referralSettingsService: ReferralSettingsService,
  ) {}

  // ─── Mobile: GET /referrals/me ──────────────────────────────────────────
  async getMyReferralSummary(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const settings = await this.referralSettingsService.get();

    const [totalRegistered, totalRewarded, rewardsData] = await Promise.all([
      this.prisma.referral.count({ where: { referrerUserId: userId } }),
      this.prisma.referral.count({
        where: { referrerUserId: userId, status: 'REWARDED' },
      }),
      this.prisma.referral.aggregate({
        where: { referrerUserId: userId, status: 'REWARDED' },
        _sum: { rewardAmount: true },
      }),
    ]);

    return {
      referralCode: user.referralCode,
      isEnabled: settings.isEnabled,
      rewardAmount: settings.rewardAmount,
      message: settings.message ?? null,
      totalRegistered,
      totalRewarded,
      totalRewardsEarned: rewardsData._sum.rewardAmount?.toNumber() ?? 0,
    };
  }

  // ─── Mobile: GET /referrals/me/history ──────────────────────────────────
  async getMyReferralHistory(userId: string, params: { page?: number; limit?: number }) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const where = { referrerUserId: userId };
    const [total, data] = await Promise.all([
      this.prisma.referral.count({ where }),
      this.prisma.referral.findMany({
        where,
        skip,
        take: limit,
        orderBy: { registeredAt: 'desc' },
        include: { referred: { select: { id: true, phoneNumber: true, name: true } } },
      }),
    ]);

    return {
      data: data.map((r) => ({
        id: r.id,
        referredUserMasked: maskPhone(r.referred.phoneNumber),
        status: r.status,
        registeredAt: r.registeredAt,
        qualifiedAt: r.qualifiedAt,
        rewardedAt: r.rewardedAt,
        rewardAmount: r.rewardAmount ? r.rewardAmount.toNumber() : null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Mobile: POST /referrals/validate ───────────────────────────────────
  async validateCode(code: string, userId: string) {
    if (!/^\d{6}$/.test(code)) {
      return { valid: false, message: 'Referral code is not valid.' };
    }
    const referrer = await this.prisma.user.findUnique({ where: { referralCode: code } });
    if (!referrer) {
      return { valid: false, message: 'Referral code is not valid.' };
    }
    if (referrer.id === userId) {
      return { valid: false, message: 'You cannot use your own referral code.' };
    }
    return { valid: true, message: 'Referral code is valid.' };
  }

  // ─── Mobile: POST /referrals/apply ──────────────────────────────────────
  async applyReferralCode(code: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.referralAppliedAt) {
      throw new ConflictException('You have already applied a referral code');
    }

    if (!/^\d{6}$/.test(code)) {
      throw new BadRequestException('Referral code is not valid.');
    }

    const referrer = await this.prisma.user.findUnique({ where: { referralCode: code } });
    if (!referrer) throw new BadRequestException('Referral code is not valid.');
    if (referrer.id === userId) throw new BadRequestException('You cannot use your own referral code.');

    // Check no existing referral record for this user
    const existing = await this.prisma.referral.findUnique({ where: { referredUserId: userId } });
    if (existing) throw new ConflictException('You have already applied a referral code');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { referredByUserId: referrer.id, referralAppliedAt: new Date() },
      });
      await tx.referral.create({
        data: {
          referrerUserId: referrer.id,
          referredUserId: userId,
          referralCode: code,
          status: 'REGISTERED',
          registeredAt: new Date(),
        },
      });
    });

    void this.audit.log('referral.applied', {}, {
      entityType: 'referral',
      metadata: { referredUserId: userId, referralCode: code, referrerUserId: referrer.id },
    });

    return { success: true, message: 'Referral code applied successfully.' };
  }

  // ─── Internal: called from SubmissionsService on first approval ──────────
  async processFirstApprovalReferralReward(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    submittingUserId: string,
    submissionId: string,
  ) {
    // Check whether submitting user is a referred user with an unrewarded referral
    const referral = await tx.referral.findUnique({
      where: { referredUserId: submittingUserId },
    });

    if (!referral || referral.status !== 'REGISTERED' || referral.rewardWalletTransactionId) {
      return; // not a referred user, already rewarded, or cancelled
    }

    // Check if this is the user's first approved submission.
    // We exclude the current submissionId so this check is correct whether called
    // before or after the approval is committed to the DB.
    const approvedCount = await tx.submission.count({
      where: { userId: submittingUserId, status: 'APPROVED', id: { not: submissionId } },
    });

    if (approvedCount !== 0) {
      // The user has other approved submissions — this is not their first approval.
      return;
    }

    // Check referral settings
    const settings = await tx.referralSetting.findFirst();
    if (!settings || !settings.isEnabled) return;

    const rewardAmount = settings.rewardAmount.toNumber();
    if (rewardAmount <= 0) return;

    // Credit the referrer's wallet
    const txRecord = await this.walletService.creditReferralReward(
      tx,
      referral.referrerUserId,
      referral.id,
      rewardAmount,
    );

    // Update referral record atomically
    await tx.referral.update({
      where: { id: referral.id },
      data: {
        status: 'REWARDED',
        qualifiedAt: new Date(),
        rewardedAt: new Date(),
        rewardAmount,
        rewardWalletTransactionId: txRecord.id,
        firstQualifiedSubmissionId: submissionId,
      },
    });

    void this.audit.log('referral.rewarded', {}, {
      entityType: 'referral',
      entityId: referral.id,
      metadata: {
        referrerUserId: referral.referrerUserId,
        referredUserId: submittingUserId,
        rewardAmount,
        submissionId,
        walletTransactionId: txRecord.id,
      },
    });
  }

  // ─── Admin: GET /admin/referrals ─────────────────────────────────────────
  async adminList(params: {
    page?: number;
    limit?: number;
    status?: string;
    referralCode?: string;
    referrerPhone?: string;
    referredPhone?: string;
    fromDate?: string;
    toDate?: string;
  }) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    if (params.referralCode) where.referralCode = { contains: params.referralCode, mode: 'insensitive' };

    const andClauses: object[] = [];
    if (params.referrerPhone) {
      andClauses.push({ referrer: { phoneNumber: { contains: params.referrerPhone } } });
    }
    if (params.referredPhone) {
      andClauses.push({ referred: { phoneNumber: { contains: params.referredPhone } } });
    }
    if (params.fromDate || params.toDate) {
      const dateFilter: Record<string, Date> = {};
      if (params.fromDate) dateFilter.gte = new Date(params.fromDate);
      if (params.toDate) {
        const d = new Date(params.toDate);
        d.setHours(23, 59, 59, 999);
        dateFilter.lte = d;
      }
      andClauses.push({ registeredAt: dateFilter });
    }
    if (andClauses.length > 0) {
      where.AND = andClauses;
    }

    const [total, data] = await Promise.all([
      this.prisma.referral.count({ where }),
      this.prisma.referral.findMany({
        where,
        skip,
        take: limit,
        orderBy: { registeredAt: 'desc' },
        include: REFERRAL_INCLUDE,
      }),
    ]);

    return {
      data: data.map(formatReferral),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Admin: GET /admin/referrals/stats ───────────────────────────────────
  async adminStats() {
    const [total, registered, rewarded, rewardsAgg] = await Promise.all([
      this.prisma.referral.count(),
      this.prisma.referral.count({ where: { status: 'REGISTERED' } }),
      this.prisma.referral.count({ where: { status: 'REWARDED' } }),
      this.prisma.referral.aggregate({
        where: { status: 'REWARDED' },
        _sum: { rewardAmount: true },
      }),
    ]);

    return {
      total,
      registered,
      rewarded,
      cancelled: await this.prisma.referral.count({ where: { status: 'CANCELLED' } }),
      totalRewardsPaid: rewardsAgg._sum.rewardAmount?.toNumber() ?? 0,
    };
  }

  // ─── Admin: GET /admin/referrals/:id ─────────────────────────────────────
  async adminGetOne(id: string) {
    const referral = await this.prisma.referral.findUnique({
      where: { id },
      include: REFERRAL_INCLUDE,
    });
    if (!referral) throw new NotFoundException('Referral not found');
    return formatReferral(referral);
  }

  // ─── Admin: PATCH /admin/referrals/:id/cancel ────────────────────────────
  async adminCancel(id: string, adminEmail: string) {
    const referral = await this.prisma.referral.findUnique({ where: { id } });
    if (!referral) throw new NotFoundException('Referral not found');
    if (referral.status === 'REWARDED') {
      throw new BadRequestException('Cannot cancel a referral that has already been rewarded');
    }
    if (referral.status === 'CANCELLED') {
      throw new BadRequestException('Referral is already cancelled');
    }

    const updated = await this.prisma.referral.update({
      where: { id },
      data: { status: 'CANCELLED', note: `Cancelled by admin: ${adminEmail}` },
      include: REFERRAL_INCLUDE,
    });

    void this.audit.log('referral.cancelled', { adminEmail }, {
      entityType: 'referral',
      entityId: id,
      metadata: { referralId: id },
    });

    return formatReferral(updated);
  }
}
