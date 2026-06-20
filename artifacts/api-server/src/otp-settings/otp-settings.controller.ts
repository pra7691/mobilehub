import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { OtpSettingsService } from './otp-settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsOptional, IsNumber, IsBoolean, IsString, Min, Max } from 'class-validator';

class UpdateOtpSettingsBody {
  @IsOptional() @IsNumber() @Min(4) @Max(8) otpLength?: number;
  @IsOptional() @IsNumber() @Min(60) otpExpirySeconds?: number;
  @IsOptional() @IsNumber() @Min(1) maxAttempts?: number;
  @IsOptional() @IsNumber() @Min(0) cooldownSeconds?: number;
  @IsOptional() @IsBoolean() isTestMode?: boolean;
  @IsOptional() @IsString() testOtp?: string;
}

@Controller('otp-settings')
@UseGuards(JwtAuthGuard)
export class OtpSettingsController {
  constructor(private service: OtpSettingsService) {}
  @Get() get() { return this.service.get(); }
  @Patch() update(@Body() body: UpdateOtpSettingsBody) { return this.service.update(body); }
}
