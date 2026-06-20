import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    PrismaModule,
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
  ],
})
export class AppModule {}
