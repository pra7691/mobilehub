import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class BannersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ─── Public (mobile JWT) ────────────────────────────────────────────────────
  async listPublic(language: 'en' | 'hi' = 'en') {
    const now = new Date();
    const banners = await this.prisma.banner.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: { OR: [{ endDate: null }, { endDate: { gte: now } }] },
      },
      orderBy: { displayOrder: 'asc' },
    });

    return banners.map((b) => ({
      id: b.id,
      imageUrl: b.mobileImageUrl ?? b.imageUrl,
      title: language === 'hi' ? (b.titleHi ?? b.titleEn ?? null) : (b.titleEn ?? null),
      description:
        language === 'hi'
          ? (b.descriptionHi ?? b.descriptionEn ?? null)
          : (b.descriptionEn ?? null),
    }));
  }

  // ─── Admin ──────────────────────────────────────────────────────────────────
  async adminList(params: { page?: number; limit?: number; isActive?: boolean }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, params.limit ?? 20);
    const skip = (page - 1) * limit;

    const where = {
      deletedAt: null,
      ...(params.isActive !== undefined && { isActive: params.isActive }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.banner.findMany({ where, skip, take: limit, orderBy: { displayOrder: 'asc' } }),
      this.prisma.banner.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async adminGet(id: string) {
    const banner = await this.prisma.banner.findFirst({ where: { id, deletedAt: null } });
    if (!banner) throw new NotFoundException('Banner not found');
    return banner;
  }

  async create(dto: CreateBannerDto, adminId?: string, adminEmail?: string) {
    let displayOrder = dto.displayOrder;
    if (displayOrder === undefined) {
      const max = await this.prisma.banner.findFirst({
        where: { deletedAt: null },
        orderBy: { displayOrder: 'desc' },
        select: { displayOrder: true },
      });
      displayOrder = (max?.displayOrder ?? -1) + 1;
    }

    const banner = await this.prisma.banner.create({
      data: {
        imageUrl: dto.imageUrl,
        mobileImageUrl: dto.mobileImageUrl,
        titleEn: dto.titleEn,
        titleHi: dto.titleHi,
        descriptionEn: dto.descriptionEn,
        descriptionHi: dto.descriptionHi,
        displayOrder,
        isActive: dto.isActive ?? true,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        createdByAdminId: adminId,
        updatedByAdminId: adminId,
      },
    });

    void this.audit.log('banner.created', { adminEmail }, {
      entityType: 'banner',
      entityId: banner.id,
    });

    return banner;
  }

  async update(id: string, dto: UpdateBannerDto, adminId?: string, adminEmail?: string) {
    await this.adminGet(id);

    const banner = await this.prisma.banner.update({
      where: { id },
      data: {
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.mobileImageUrl !== undefined && { mobileImageUrl: dto.mobileImageUrl }),
        ...(dto.titleEn !== undefined && { titleEn: dto.titleEn }),
        ...(dto.titleHi !== undefined && { titleHi: dto.titleHi }),
        ...(dto.descriptionEn !== undefined && { descriptionEn: dto.descriptionEn }),
        ...(dto.descriptionHi !== undefined && { descriptionHi: dto.descriptionHi }),
        ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...('startDate' in dto && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
        ...('endDate' in dto && { endDate: dto.endDate ? new Date(dto.endDate) : null }),
        updatedByAdminId: adminId,
      },
    });

    void this.audit.log('banner.updated', { adminEmail }, {
      entityType: 'banner',
      entityId: id,
    });

    return banner;
  }

  async updateStatus(id: string, isActive: boolean, adminId?: string, adminEmail?: string) {
    await this.adminGet(id);

    const banner = await this.prisma.banner.update({
      where: { id },
      data: { isActive, updatedByAdminId: adminId },
    });

    void this.audit.log('banner.status_changed', { adminEmail }, {
      entityType: 'banner',
      entityId: id,
      metadata: { isActive },
    });

    return banner;
  }

  async reorder(items: { id: string; displayOrder: number }[]) {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.banner.update({
          where: { id: item.id },
          data: { displayOrder: item.displayOrder },
        }),
      ),
    );
    return { success: true };
  }

  async delete(id: string, adminEmail?: string) {
    await this.adminGet(id);

    await this.prisma.banner.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    void this.audit.log('banner.deleted', { adminEmail }, {
      entityType: 'banner',
      entityId: id,
    });

    return { success: true };
  }
}
