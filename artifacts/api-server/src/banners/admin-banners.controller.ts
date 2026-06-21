import {
  Controller, Get, Post, Patch, Delete,
  Param, Query, Body, UseGuards, Request,
} from '@nestjs/common';
import { BannersService } from './banners.service';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { UpdateBannerStatusDto } from './dto/update-banner-status.dto';
import { ReorderBannersDto } from './dto/reorder-banners.dto';
import { IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

class AdminListBannersQuery {
  @IsOptional() @Type(() => Number) page?: number;
  @IsOptional() @Type(() => Number) limit?: number;
  @IsOptional() @IsBoolean() @Type(() => Boolean) isActive?: boolean;
}

type AdminReq = { user: { sub: string; email?: string } };

@Controller('admin/banners')
@UseGuards(AdminJwtGuard)
export class AdminBannersController {
  constructor(private service: BannersService) {}

  @Get()
  list(@Query() query: AdminListBannersQuery) {
    return this.service.adminList({ page: query.page, limit: query.limit, isActive: query.isActive });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.adminGet(id);
  }

  @Post()
  create(@Body() dto: CreateBannerDto, @Request() req: AdminReq) {
    return this.service.create(dto, req.user.sub, req.user.email);
  }

  @Post('reorder')
  reorder(@Body() dto: ReorderBannersDto) {
    return this.service.reorder(dto.items);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBannerDto, @Request() req: AdminReq) {
    return this.service.update(id, dto, req.user.sub, req.user.email);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateBannerStatusDto,
    @Request() req: AdminReq,
  ) {
    return this.service.updateStatus(id, dto.isActive, req.user.sub, req.user.email);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Request() req: AdminReq) {
    return this.service.delete(id, req.user.email);
  }
}
