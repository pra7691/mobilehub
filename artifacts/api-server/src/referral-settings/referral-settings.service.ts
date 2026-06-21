import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateReferralSettingsDto } from './dto/update-referral-settings.dto';

@Injectable()
export class ReferralSettingsService {
  constructor(private prisma: PrismaService) {}

  async get() {
    let settings = await this.prisma.referralSetting.findFirst();
    if (!settings) {
      settings = await this.prisma.referralSetting.create({ data: {} });
    }
    return {
      ...settings,
      rewardAmount: settings.rewardAmount.toNumber(),
    };
  }

  async update(dto: UpdateReferralSettingsDto) {
    const settings = await this.get();
    const updated = await this.prisma.referralSetting.update({
      where: { id: settings.id },
      data: {
        ...(dto.isEnabled !== undefined && { isEnabled: dto.isEnabled }),
        ...(dto.rewardAmount !== undefined && { rewardAmount: dto.rewardAmount }),
        ...(dto.message !== undefined && { message: dto.message }),
      },
    });
    return { ...updated, rewardAmount: updated.rewardAmount.toNumber() };
  }
}
