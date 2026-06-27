import { Module } from '@nestjs/common';
import { UploadSessionController } from './upload-session.controller';
import { UploadSessionService } from './upload-session.service';
import { StorageModule } from '../storage/storage.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [UploadSessionController],
  providers: [UploadSessionService],
})
export class UploadSessionModule {}
