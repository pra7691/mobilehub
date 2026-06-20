import { Module } from '@nestjs/common';
import { OtpSettingsController } from './otp-settings.controller';
import { OtpSettingsService } from './otp-settings.service';

@Module({
  controllers: [OtpSettingsController],
  providers: [OtpSettingsService],
})
export class OtpSettingsModule {}
