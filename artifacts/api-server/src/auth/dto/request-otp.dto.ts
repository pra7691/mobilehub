import { IsString, Matches } from 'class-validator';

export class RequestOtpDto {
  /**
   * Indian mobile number: 10 digits (e.g. 9876543210),
   * or full E.164 format (+919876543210 or 919876543210).
   */
  @IsString()
  @Matches(/^(\+?91)?[6-9]\d{9}$/, {
    message:
      'Invalid Indian phone number. Enter a 10-digit mobile number starting with 6–9 (e.g. 9876543210).',
  })
  phoneNumber!: string;
}
