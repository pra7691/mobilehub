import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { StorageProfileService } from './storage-profile.service';
import { StorageProfileController } from './storage-profile.controller';
import { EncryptionService } from './encryption.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StorageController, StorageProfileController],
  providers: [StorageService, StorageProfileService, EncryptionService],
  exports: [StorageService],
})
export class StorageModule {}
