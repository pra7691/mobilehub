import { IsString } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  phoneNumber!: string;
}
