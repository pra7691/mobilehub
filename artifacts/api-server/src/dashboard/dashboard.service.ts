import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    const [totalUsers, activeUsers, totalTasks, activeTasks, totalSubmissions, pendingSubmissions, wallets] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, status: 'active' } }),
      this.prisma.task.count({ where: { deletedAt: null } }),
      this.prisma.task.count({ where: { deletedAt: null, status: 'active' } }),
      this.prisma.submission.count(),
      this.prisma.submission.count({ where: { status: 'UNDER_REVIEW' } }),
      this.prisma.wallet.findMany({ select: { availableBalance: true } }),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTransactions = await this.prisma.walletTransaction.findMany({
      where: { createdAt: { gte: today }, type: 'CREDIT' },
      select: { amount: true },
    });

    const totalWalletBalance = wallets.reduce((sum, w) => sum + w.availableBalance.toNumber(), 0);
    const totalEarnedToday = todayTransactions.reduce((sum, t) => sum + t.amount.toNumber(), 0);

    return { totalUsers, activeUsers, totalTasks, activeTasks, totalSubmissions, pendingSubmissions, totalWalletBalance, totalEarnedToday };
  }

  async getRecentActivity(limit = 20) {
    const [recentSubmissions, recentUsers] = await Promise.all([
      this.prisma.submission.findMany({
        take: Math.ceil(limit / 2),
        orderBy: { createdAt: 'desc' },
        include: { task: { select: { title: true } }, user: { select: { phoneNumber: true } } },
      }),
      this.prisma.user.findMany({
        take: Math.ceil(limit / 2),
        orderBy: { createdAt: 'desc' },
        where: { deletedAt: null },
      }),
    ]);

    const items = [
      ...recentSubmissions.map(s => ({
        id: s.id,
        type: s.status === 'APPROVED' ? 'submission_approved' : s.status === 'REJECTED' ? 'submission_rejected' : 'new_submission',
        description: `${s.user.phoneNumber} submitted "${s.task.title}"`,
        createdAt: s.createdAt,
      })),
      ...recentUsers.map(u => ({
        id: u.id,
        type: 'new_user',
        description: `New user registered: ${u.phoneNumber}`,
        createdAt: u.createdAt,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);

    return { data: items };
  }

  async getSubmissionTrends() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const submissions = await this.prisma.submission.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, status: true },
    });

    const trendMap = new Map<string, { count: number; approved: number; rejected: number }>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo);
      d.setDate(d.getDate() + i);
      trendMap.set(d.toISOString().split('T')[0]!, { count: 0, approved: 0, rejected: 0 });
    }

    for (const s of submissions) {
      const key = s.createdAt.toISOString().split('T')[0]!;
      const entry = trendMap.get(key);
      if (entry) {
        entry.count++;
        if (s.status === 'APPROVED') entry.approved++;
        if (s.status === 'REJECTED') entry.rejected++;
      }
    }

    return { data: Array.from(trendMap.entries()).map(([date, v]) => ({ date, ...v })) };
  }
}
