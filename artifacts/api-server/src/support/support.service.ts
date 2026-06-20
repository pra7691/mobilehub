import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface UpdateDto {
  email?: string;
  whatsappNumber?: string;
  phoneNumber?: string;
  workingHours?: string;
  message?: string;
}

@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService) {}

  async get() {
    const existing = await this.prisma.supportSettings.findFirst();
    if (!existing) {
      return this.prisma.supportSettings.create({
        data: { email: '', whatsappNumber: '' },
      });
    }
    return existing;
  }

  async update(dto: UpdateDto) {
    const existing = await this.get();
    return this.prisma.supportSettings.update({ where: { id: existing.id }, data: dto });
  }
}
