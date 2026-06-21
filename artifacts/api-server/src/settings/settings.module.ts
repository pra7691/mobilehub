import { Module } from '@nestjs/common';
import {
  AdminSettingsController,
  AppSettingsController,
  PublicLegalController,
  PublicAccountController,
} from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [
    AdminSettingsController,
    AppSettingsController,
    PublicLegalController,
    PublicAccountController,
  ],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
