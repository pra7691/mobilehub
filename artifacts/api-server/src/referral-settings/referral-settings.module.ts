import { Module } from '@nestjs/common';
import { ReferralSettingsController } from './referral-settings.controller';
import { ReferralSettingsService } from './referral-settings.service';

@Module({
  controllers: [ReferralSettingsController],
  providers: [ReferralSettingsService],
  exports: [ReferralSettingsService],
})
export class ReferralSettingsModule {}
