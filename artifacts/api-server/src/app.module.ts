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
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
