import { Controller, Post, UseGuards } from '@nestjs/common';
import { AdminJwtGuard } from './auth/guards/admin-jwt.guard';
import { PrismaService } from './prisma/prisma.service';

/**
 * TEMPORARY – one-shot controller to sync dev config data to production.
 * DELETE THIS FILE and remove from AppModule after use.
 */
@Controller('admin/internal')
@UseGuards(AdminJwtGuard)
export class SeedProdController {
  constructor(private prisma: PrismaService) {}

  @Post('apply-seed')
  async applySeed() {
    const results: string[] = [];

    // ── App Settings ────────────────────────────────────────────────────────
    const simpleSettings = [
      { key: 'APP_NAME', value: 'tarzi' },
      { key: 'PAYOUT_ENABLED', value: 'true' },
      { key: 'PAYOUT_MIN_AMOUNT', value: '1' },
      { key: 'PAYOUT_MAX_AMOUNT', value: '' },
      { key: 'PAYOUT_MAX_DAILY_PER_USER', value: '' },
      { key: 'PAYOUT_MAX_PENDING_PER_USER', value: '' },
      { key: 'PAYOUT_MESSAGE', value: '' },
    ];

    for (const s of simpleSettings) {
      await this.prisma.appSetting.upsert({
        where: { key: s.key },
        update: { value: s.value, updatedBy: 'seed-prod' },
        create: { key: s.key, value: s.value, updatedBy: 'seed-prod' },
      });
      results.push(`upserted app_settings.${s.key}`);
    }

    // Privacy Policy
    await this.prisma.appSetting.upsert({
      where: { key: 'PRIVACY_POLICY' },
      update: {
        title: 'Privacy Policy',
        content: 'This is our privacy policy content.',
        isPublished: true,
        version: 2,
        updatedBy: 'seed-prod',
      },
      create: {
        key: 'PRIVACY_POLICY',
        value: '',
        title: 'Privacy Policy',
        content: 'This is our privacy policy content.',
        isPublished: true,
        version: 2,
        updatedBy: 'seed-prod',
      },
    });
    results.push('upserted app_settings.PRIVACY_POLICY');

    // Terms & Conditions
    await this.prisma.appSetting.upsert({
      where: { key: 'TERMS_AND_CONDITIONS' },
      update: {
        title: 'Terms & Conditions',
        content: 'These are our terms.',
        isPublished: true,
        version: 1,
        updatedBy: 'seed-prod',
      },
      create: {
        key: 'TERMS_AND_CONDITIONS',
        value: '',
        title: 'Terms & Conditions',
        content: 'These are our terms.',
        isPublished: true,
        version: 1,
        updatedBy: 'seed-prod',
      },
    });
    results.push('upserted app_settings.TERMS_AND_CONDITIONS');

    // ── Referral Settings ───────────────────────────────────────────────────
    const existingReferral = await this.prisma.referralSetting.findFirst();
    if (!existingReferral) {
      await this.prisma.referralSetting.create({
        data: { isEnabled: true, rewardAmount: 100.0, message: null },
      });
      results.push('created referral_setting');
    } else {
      await this.prisma.referralSetting.update({
        where: { id: existingReferral.id },
        data: { isEnabled: true, rewardAmount: 100.0 },
      });
      results.push('updated referral_setting');
    }

    return { ok: true, applied: results };
  }
}
