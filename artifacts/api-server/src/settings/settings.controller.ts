import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsPositive,
  IsInt,
  Min,
  IsIn,
  IsNotEmpty,
  Matches,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

class UpdateGeneralDto {
  @IsOptional() @IsString() appName?: string;
}

class UpdateSupportDto {
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() whatsappNumber?: string;
  @IsOptional() @IsString() phoneNumber?: string;
  @IsOptional() @IsString() workingHours?: string;
  @IsOptional() @IsString() message?: string;
}

class UpdateLegalDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}

class UpdateBannerSettingsDto {
  @IsOptional() @IsIn([5, 7]) @Type(() => Number) autoSlideSeconds?: 5 | 7;
}

class UpdatePayoutSettingsDto {
  @IsOptional() @IsBoolean() payoutsEnabled?: boolean;
  @IsOptional() @IsNumber() @IsPositive() @Type(() => Number) minWithdrawalAmount?: number;
  @IsOptional() @IsNumber() @IsPositive() @Type(() => Number) maxWithdrawalAmount?: number | null;
  @IsOptional() @IsString() payoutMessage?: string | null;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) maxDailyPayoutsPerUser?: number | null;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) maxPendingPayoutsPerUser?: number | null;
}

@Controller('admin/settings')
@UseGuards(AdminJwtGuard)
export class AdminSettingsController {
  constructor(private service: SettingsService) {}

  @Get()
  getAll() {
    return this.service.adminGetAll();
  }

  @Patch('general')
  updateGeneral(
    @Body() body: UpdateGeneralDto,
    @Request() req: { user: { email?: string; sub: string } },
  ) {
    return this.service.updateGeneral(body, req.user.email ?? req.user.sub);
  }

  @Patch('support')
  updateSupport(
    @Body() body: UpdateSupportDto,
    @Request() req: { user: { email?: string; sub: string } },
  ) {
    return this.service.updateSupport(body, req.user.email ?? req.user.sub);
  }

  @Patch('payout')
  updatePayoutSettings(
    @Body() body: UpdatePayoutSettingsDto,
    @Request() req: { user: { email?: string; sub: string } },
  ) {
    return this.service.updatePayoutSettings(body, req.user.email ?? req.user.sub);
  }

  @Get('banner')
  getBannerSettings() {
    return this.service.getBannerSettings();
  }

  @Patch('banner')
  updateBannerSettings(
    @Body() body: UpdateBannerSettingsDto,
    @Request() req: { user: { email?: string; sub: string } },
  ) {
    return this.service.updateBannerSettings(body, req.user.email ?? req.user.sub);
  }

  @Patch('legal/:slug')
  updateLegal(
    @Param('slug') slug: string,
    @Body() body: UpdateLegalDto,
    @Request() req: { user: { email?: string; sub: string } },
  ) {
    return this.service.updateLegal(
      slug as 'privacy-policy' | 'terms-and-conditions',
      body,
      req.user.email ?? req.user.sub,
    );
  }
}

@Controller('app')
@UseGuards(JwtAuthGuard)
export class AppSettingsController {
  constructor(private service: SettingsService) {}

  @Get('settings')
  getAppSettings() {
    return this.service.getAppSettings();
  }

  @Get('settings/banner')
  getAppBannerSettings() {
    return this.service.getBannerSettings();
  }

  @Get('legal/:slug')
  getLegal(@Param('slug') slug: string) {
    return this.service.getLegal(slug as 'privacy-policy' | 'terms-and-conditions');
  }
}

@Controller('public/legal')
export class PublicLegalController {
  constructor(private service: SettingsService) {}

  @Get(':slug')
  async getPublicLegal(@Param('slug') slug: string) {
    const knownSlugs = ['privacy-policy', 'terms-and-conditions'];
    if (!knownSlugs.includes(slug)) {
      return { available: false, message: 'Unknown legal document.' };
    }
    try {
      return await this.service.getLegal(slug as 'privacy-policy' | 'terms-and-conditions');
    } catch {
      return { available: false, message: 'This content is not currently available.' };
    }
  }
}

class PublicDeletionRequestDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+?91)?[6-9]\d{9}$/)
  phoneNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

@Controller('public/account')
export class PublicAccountController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('delete-request')
  async createDeletionRequest(@Body() dto: PublicDeletionRequestDto) {
    const stripped = dto.phoneNumber.replace(/[\s\-()]/g, '').replace(/^\+/, '');
    const phoneNumber = stripped.length === 10 ? '+91' + stripped : '+' + stripped;

    await this.prisma.accountDeletionRequest.create({
      data: {
        phoneNumber,
        reason: dto.reason?.trim() ?? null,
      },
    });

    return {
      ok: true,
      message:
        'Your request has been received. If a Tarzi account is registered to this number, it will be processed within 30 days.',
    };
  }
}
