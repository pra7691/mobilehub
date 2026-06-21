import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface UpdateDto {
  otpLength?: number;
  otpExpirySeconds?: number;
  maxAttempts?: number;
  cooldownSeconds?: number;
  isTestMode?: boolean;
  testOtp?: string;
  allowedPhoneNumbers?: string;
}

@Injectable()
export class OtpSettingsService {
  constructor(private prisma: PrismaService) {}

  async get() {
    let settings = await this.prisma.otpSetting.findFirst();
    if (!settings) {
      settings = await this.prisma.otpSetting.create({ data: {} });
    }
    return settings;
  }

  async update(dto: UpdateDto) {
    const settings = await this.get();
    return this.prisma.otpSetting.update({ where: { id: settings.id }, data: dto });
  }
}
