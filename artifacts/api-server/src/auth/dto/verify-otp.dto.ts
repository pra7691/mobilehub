import { IsString } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  sessionId!: string;

  @IsString()
  otp!: string;
}
