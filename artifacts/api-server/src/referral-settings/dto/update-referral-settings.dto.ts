import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateReferralSettingsDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rewardAmount?: number;

  @IsOptional()
  @IsString()
  message?: string;
}
