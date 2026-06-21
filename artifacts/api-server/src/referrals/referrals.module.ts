import { Module } from '@nestjs/common';
import { ReferralsController } from './referrals.controller';
import { AdminReferralsController } from './admin-referrals.controller';
import { ReferralsService } from './referrals.service';
import { WalletModule } from '../wallet/wallet.module';
import { ReferralSettingsModule } from '../referral-settings/referral-settings.module';

@Module({
  imports: [WalletModule, ReferralSettingsModule],
  controllers: [ReferralsController, AdminReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
