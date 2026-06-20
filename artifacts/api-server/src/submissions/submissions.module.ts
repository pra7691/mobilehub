import { Module } from '@nestjs/common';
import { SubmissionsController } from './submissions.controller';
import { AdminSubmissionsController } from './admin-submissions.controller';
import { SubmissionsService } from './submissions.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [PrismaModule, StorageModule, WalletModule],
  controllers: [SubmissionsController, AdminSubmissionsController],
  providers: [SubmissionsService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
