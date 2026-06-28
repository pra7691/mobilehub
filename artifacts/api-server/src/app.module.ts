import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AdminUsersModule } from './admin-users/admin-users.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { SubcategoriesModule } from './subcategories/subcategories.module';
import { TasksModule } from './tasks/tasks.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { WalletModule } from './wallet/wallet.module';
import { OtpSettingsModule } from './otp-settings/otp-settings.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { StorageModule } from './storage/storage.module';
import { FaqModule } from './faq/faq.module';
import { SupportModule } from './support/support.module';
import { PagesModule } from './pages/pages.module';
import { NoticesModule } from './notices/notices.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditModule } from './audit/audit.module';
import { SettingsModule } from './settings/settings.module';
import { MobileErrorLogsModule } from './mobile-error-logs/mobile-error-logs.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { PayoutsModule } from './payouts/payouts.module';
import { ReferralsModule } from './referrals/referrals.module';
import { ReferralSettingsModule } from './referral-settings/referral-settings.module';
import { BannersModule } from './banners/banners.module';
import { TranslateModule } from './translate/translate.module';
import { UploadSessionModule } from './upload-sessions/upload-session.module';
import { DiagnosticsModule } from './diagnostics/diagnostics.module';
import { SeedProdController } from './seed-prod.controller';

@Module({
  imports: [
    // Rate limiting: 600 req per 60s globally; auth endpoints set tighter limits
    ThrottlerModule.forRoot([{ name: 'global', ttl: 60000, limit: 600 }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    AdminUsersModule,
    UsersModule,
    CategoriesModule,
    SubcategoriesModule,
    TasksModule,
    SubmissionsModule,
    WalletModule,
    OtpSettingsModule,
    DashboardModule,
    HealthModule,
    StorageModule,
    FaqModule,
    SupportModule,
    PagesModule,
    NoticesModule,
    NotificationsModule,
    SettingsModule,
    MobileErrorLogsModule,
    PaymentMethodsModule,
    PayoutsModule,
    ReferralsModule,
    ReferralSettingsModule,
    BannersModule,
    TranslateModule,
    UploadSessionModule,
    DiagnosticsModule,
  ],
  controllers: [SeedProdController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
