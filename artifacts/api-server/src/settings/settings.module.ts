import { Module } from '@nestjs/common';
import { AdminSettingsController, AppSettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [AdminSettingsController, AppSettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
