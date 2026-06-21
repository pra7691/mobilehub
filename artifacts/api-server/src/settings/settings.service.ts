import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const LEGAL_KEYS = {
  'privacy-policy': 'PRIVACY_POLICY',
  'terms-and-conditions': 'TERMS_AND_CONDITIONS',
} as const;

type LegalSlug = keyof typeof LEGAL_KEYS;

interface LegalDto {
  title?: string;
  content?: string;
  isPublished?: boolean;
}

interface SupportDto {
  email?: string;
  whatsappNumber?: string;
  phoneNumber?: string;
  workingHours?: string;
  message?: string;
}

interface GeneralDto {
  appName?: string;
}

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  // ─── Migration helper — run once on first getAll call ────────────────────────
  private migrated = false;
  private async migrateOnce() {
    if (this.migrated) return;
    this.migrated = true;
    try {
      // Migrate privacy-policy static page → PRIVACY_POLICY AppSetting (if not already present)
      const existing = await this.prisma.appSetting.findUnique({ where: { key: 'PRIVACY_POLICY' } });
      if (!existing) {
        const page = await this.prisma.staticPage.findUnique({ where: { slug: 'privacy-policy' } }).catch(() => null);
        if (page) {
          await this.prisma.appSetting.create({
            data: {
              key: 'PRIVACY_POLICY',
              title: page.title,
              content: page.content,
              isPublished: page.isPublished,
              version: page.version,
            },
          });
        }
      }
      // Migrate terms static page
      const existingTerms = await this.prisma.appSetting.findUnique({ where: { key: 'TERMS_AND_CONDITIONS' } });
      if (!existingTerms) {
        const page = await this.prisma.staticPage.findUnique({ where: { slug: 'terms-and-conditions' } }).catch(() => null);
        if (page) {
          await this.prisma.appSetting.create({
            data: {
              key: 'TERMS_AND_CONDITIONS',
              title: page.title,
              content: page.content,
              isPublished: page.isPublished,
              version: page.version,
            },
          });
        }
      }
    } catch {
      // non-fatal — continue even if migration fails
    }
  }

  // ─── Admin: GET /admin/settings ───────────────────────────────────────────
  async adminGetAll() {
    await this.migrateOnce();

    const [support, appName, privacyPolicy, termsAndConditions, payoutSettings] = await Promise.all([
      this.prisma.supportSettings.findFirst(),
      this.prisma.appSetting.findUnique({ where: { key: 'APP_NAME' } }),
      this.prisma.appSetting.findUnique({ where: { key: 'PRIVACY_POLICY' } }),
      this.prisma.appSetting.findUnique({ where: { key: 'TERMS_AND_CONDITIONS' } }),
      this.getPayoutSettings(),
    ]);

    return {
      general: {
        appName: appName?.value ?? 'Capto',
      },
      payout: payoutSettings,
      support: support
        ? {
            email: support.email,
            whatsappNumber: support.whatsappNumber,
            phoneNumber: support.phoneNumber ?? null,
            workingHours: support.workingHours ?? null,
            message: support.message ?? null,
          }
        : null,
      legal: {
        privacyPolicy: privacyPolicy
          ? {
              title: privacyPolicy.title ?? 'Privacy Policy',
              content: privacyPolicy.content ?? '',
              isPublished: privacyPolicy.isPublished,
              version: privacyPolicy.version,
              updatedAt: privacyPolicy.updatedAt,
              updatedBy: privacyPolicy.updatedBy ?? null,
            }
          : { title: 'Privacy Policy', content: '', isPublished: false, version: 1, updatedAt: null, updatedBy: null },
        termsAndConditions: termsAndConditions
          ? {
              title: termsAndConditions.title ?? 'Terms & Conditions',
              content: termsAndConditions.content ?? '',
              isPublished: termsAndConditions.isPublished,
              version: termsAndConditions.version,
              updatedAt: termsAndConditions.updatedAt,
              updatedBy: termsAndConditions.updatedBy ?? null,
            }
          : { title: 'Terms & Conditions', content: '', isPublished: false, version: 1, updatedAt: null, updatedBy: null },
      },
    };
  }

  // ─── Admin: PATCH /admin/settings/general ─────────────────────────────────
  async updateGeneral(dto: GeneralDto, adminEmail?: string) {
    if (dto.appName !== undefined) {
      await this.prisma.appSetting.upsert({
        where: { key: 'APP_NAME' },
        update: { value: dto.appName, updatedBy: adminEmail },
        create: { key: 'APP_NAME', value: dto.appName, updatedBy: adminEmail },
      });
    }
    return { appName: dto.appName };
  }

  // ─── Admin: PATCH /admin/settings/support ─────────────────────────────────
  async updateSupport(dto: SupportDto, adminEmail?: string) {
    const existing = await this.prisma.supportSettings.findFirst();
    if (existing) {
      return this.prisma.supportSettings.update({ where: { id: existing.id }, data: dto });
    }
    return this.prisma.supportSettings.create({
      data: {
        email: dto.email ?? '',
        whatsappNumber: dto.whatsappNumber ?? '',
        phoneNumber: dto.phoneNumber,
        workingHours: dto.workingHours,
        message: dto.message,
      },
    });
  }

  // ─── Admin: PATCH /admin/settings/legal/:slug ─────────────────────────────
  async updateLegal(slug: LegalSlug, dto: LegalDto, adminEmail?: string) {
    const key = LEGAL_KEYS[slug];
    if (!key) throw new NotFoundException('Unknown legal document type');

    // Bump version if content changed
    const existing = await this.prisma.appSetting.findUnique({ where: { key } });
    const contentChanged = dto.content !== undefined && dto.content !== (existing?.content ?? '');
    const newVersion = contentChanged ? (existing?.version ?? 0) + 1 : (existing?.version ?? 1);

    const result = await this.prisma.appSetting.upsert({
      where: { key },
      update: {
        title: dto.title ?? existing?.title,
        content: dto.content ?? existing?.content,
        isPublished: dto.isPublished ?? existing?.isPublished ?? false,
        version: newVersion,
        updatedBy: adminEmail,
      },
      create: {
        key,
        title: dto.title ?? (slug === 'privacy-policy' ? 'Privacy Policy' : 'Terms & Conditions'),
        content: dto.content ?? '',
        isPublished: dto.isPublished ?? false,
        version: 1,
        updatedBy: adminEmail,
      },
    });

    return {
      title: result.title,
      content: result.content,
      isPublished: result.isPublished,
      version: result.version,
      updatedAt: result.updatedAt,
      updatedBy: result.updatedBy,
    };
  }

  // ─── Admin: GET/PATCH /admin/settings/payout ──────────────────────────────
  async getPayoutSettings() {
    const keys = [
      'PAYOUT_ENABLED',
      'PAYOUT_MIN_AMOUNT',
      'PAYOUT_MAX_AMOUNT',
      'PAYOUT_MESSAGE',
      'PAYOUT_MAX_DAILY_PER_USER',
      'PAYOUT_MAX_PENDING_PER_USER',
    ];
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { in: keys } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      payoutsEnabled: map['PAYOUT_ENABLED'] !== 'false',
      minWithdrawalAmount: parseFloat(map['PAYOUT_MIN_AMOUNT'] ?? '100'),
      maxWithdrawalAmount: map['PAYOUT_MAX_AMOUNT'] ? parseFloat(map['PAYOUT_MAX_AMOUNT']) : null,
      payoutMessage: map['PAYOUT_MESSAGE'] ?? null,
      maxDailyPayoutsPerUser: map['PAYOUT_MAX_DAILY_PER_USER']
        ? parseInt(map['PAYOUT_MAX_DAILY_PER_USER'], 10)
        : null,
      maxPendingPayoutsPerUser: map['PAYOUT_MAX_PENDING_PER_USER']
        ? parseInt(map['PAYOUT_MAX_PENDING_PER_USER'], 10)
        : null,
    };
  }

  async updatePayoutSettings(
    dto: {
      payoutsEnabled?: boolean;
      minWithdrawalAmount?: number;
      maxWithdrawalAmount?: number | null;
      payoutMessage?: string | null;
      maxDailyPayoutsPerUser?: number | null;
      maxPendingPayoutsPerUser?: number | null;
    },
    adminEmail?: string,
  ) {
    const upserts: Promise<unknown>[] = [];
    const upsert = (key: string, value: string | null) =>
      this.prisma.appSetting.upsert({
        where: { key },
        update: { value, updatedBy: adminEmail },
        create: { key, value, updatedBy: adminEmail },
      });

    if (dto.payoutsEnabled !== undefined) {
      upserts.push(upsert('PAYOUT_ENABLED', String(dto.payoutsEnabled)));
    }
    if (dto.minWithdrawalAmount !== undefined) {
      upserts.push(upsert('PAYOUT_MIN_AMOUNT', String(dto.minWithdrawalAmount)));
    }
    if ('maxWithdrawalAmount' in dto) {
      upserts.push(upsert('PAYOUT_MAX_AMOUNT', dto.maxWithdrawalAmount != null ? String(dto.maxWithdrawalAmount) : null));
    }
    if ('payoutMessage' in dto) {
      upserts.push(upsert('PAYOUT_MESSAGE', dto.payoutMessage ?? null));
    }
    if ('maxDailyPayoutsPerUser' in dto) {
      upserts.push(upsert('PAYOUT_MAX_DAILY_PER_USER', dto.maxDailyPayoutsPerUser != null ? String(dto.maxDailyPayoutsPerUser) : null));
    }
    if ('maxPendingPayoutsPerUser' in dto) {
      upserts.push(upsert('PAYOUT_MAX_PENDING_PER_USER', dto.maxPendingPayoutsPerUser != null ? String(dto.maxPendingPayoutsPerUser) : null));
    }

    await Promise.all(upserts);
    return this.getPayoutSettings();
  }

  // ─── Banner settings ──────────────────────────────────────────────────────
  async getBannerSettings() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: 'HOME_BANNER_AUTOSLIDE_SECONDS' } });
    const raw = row?.value;
    const parsed = raw ? parseInt(raw, 10) : 5;
    return { autoSlideSeconds: parsed === 7 ? 7 : 5 };
  }

  async updateBannerSettings(dto: { autoSlideSeconds?: 5 | 7 }, adminEmail?: string) {
    if (dto.autoSlideSeconds !== undefined) {
      const value = dto.autoSlideSeconds === 7 ? '7' : '5';
      await this.prisma.appSetting.upsert({
        where: { key: 'HOME_BANNER_AUTOSLIDE_SECONDS' },
        update: { value, updatedBy: adminEmail },
        create: { key: 'HOME_BANNER_AUTOSLIDE_SECONDS', value, updatedBy: adminEmail },
      });
    }
    return this.getBannerSettings();
  }

  // ─── App (public-auth): GET /app/settings ─────────────────────────────────
  async getAppSettings() {
    const [support, appName, privacyPolicy, termsAndConditions] = await Promise.all([
      this.prisma.supportSettings.findFirst(),
      this.prisma.appSetting.findUnique({ where: { key: 'APP_NAME' } }),
      this.prisma.appSetting.findUnique({ where: { key: 'PRIVACY_POLICY' } }),
      this.prisma.appSetting.findUnique({ where: { key: 'TERMS_AND_CONDITIONS' } }),
    ]);

    return {
      appName: appName?.value ?? 'Capto',
      support: support?.email
        ? {
            email: support.email,
            whatsappNumber: support.whatsappNumber,
            phoneNumber: support.phoneNumber ?? null,
            workingHours: support.workingHours ?? null,
            message: support.message ?? null,
          }
        : null,
      legal: {
        privacyPolicy: privacyPolicy?.isPublished && privacyPolicy.content
          ? { title: privacyPolicy.title ?? 'Privacy Policy', version: privacyPolicy.version, updatedAt: privacyPolicy.updatedAt }
          : null,
        termsAndConditions: termsAndConditions?.isPublished && termsAndConditions.content
          ? { title: termsAndConditions.title ?? 'Terms & Conditions', version: termsAndConditions.version, updatedAt: termsAndConditions.updatedAt }
          : null,
      },
    };
  }

  // ─── App (public-auth): GET /app/legal/:slug ──────────────────────────────
  async getLegal(slug: LegalSlug) {
    const key = LEGAL_KEYS[slug];
    if (!key) throw new NotFoundException('Unknown legal document type');

    const setting = await this.prisma.appSetting.findUnique({ where: { key } });
    if (!setting || !setting.isPublished || !setting.content) {
      throw new NotFoundException('This content is not currently available');
    }

    return {
      title: setting.title ?? (slug === 'privacy-policy' ? 'Privacy Policy' : 'Terms & Conditions'),
      content: setting.content,
      version: setting.version,
      updatedAt: setting.updatedAt,
    };
  }
}
