import { Module } from '@nestjs/common';
import { SubmissionsController } from './submissions.controller';
import { AdminSubmissionsController } from './admin-submissions.controller';
import { SubmissionsService } from './submissions.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [SubmissionsController, AdminSubmissionsController],
  providers: [SubmissionsService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
