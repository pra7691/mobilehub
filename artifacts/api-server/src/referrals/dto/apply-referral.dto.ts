import { IsString, Length, Matches } from 'class-validator';

export class ApplyReferralDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'Referral code must be exactly 6 numeric digits' })
  referralCode!: string;
}
