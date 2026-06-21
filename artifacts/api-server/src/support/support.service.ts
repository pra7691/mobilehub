import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveText } from '../categories/categories.service';

interface UpdateDto {
  email?: string;
  whatsappNumber?: string;
  phoneNumber?: string;
  workingHours?: string;
  message?: string;
  supportMessageEn?: string;
  supportMessageHi?: string;
}

type SupportRow = { id: string; email: string; whatsappNumber: string; phoneNumber: string | null; workingHours: string | null; message: string | null; supportMessageEn: string | null; supportMessageHi: string | null; updatedAt: Date };

@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService) {}

  async get(language?: string) {
    const existing = await this.prisma.supportSettings.findFirst();
    const record = existing ?? await this.prisma.supportSettings.create({
      data: { email: '', whatsappNumber: '' },
    });
    if (!language) return record;
    const row = record as SupportRow;
    return {
      ...row,
      message: resolveText(row.supportMessageEn, row.message ?? '', row.supportMessageHi, language) || null,
    };
  }

  async update(dto: UpdateDto) {
    const existing = await this.get();
    const updateData: Record<string, unknown> = { ...dto };
    if (dto.supportMessageEn !== undefined) updateData.message = dto.supportMessageEn;
    return this.prisma.supportSettings.update({ where: { id: existing.id }, data: updateData });
  }
}
