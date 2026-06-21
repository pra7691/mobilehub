import { Module } from '@nestjs/common';
import { AdminSettingsController, AppSettingsController, PublicLegalController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [AdminSettingsController, AppSettingsController, PublicLegalController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
