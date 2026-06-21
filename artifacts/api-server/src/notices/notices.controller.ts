import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, UseGuards } from '@nestjs/common';
import { NoticesService } from './notices.service';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

class CreateNoticeBody {
  @IsString() title!: string;
  @IsString() content!: string;
  @IsOptional() @IsString() titleEn?: string;
  @IsOptional() @IsString() titleHi?: string;
  @IsOptional() @IsString() contentEn?: string;
  @IsOptional() @IsString() contentHi?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() endsAt?: string;
}

class UpdateNoticeBody {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() titleEn?: string;
  @IsOptional() @IsString() titleHi?: string;
  @IsOptional() @IsString() contentEn?: string;
  @IsOptional() @IsString() contentHi?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() startsAt?: string | null;
  @IsOptional() @IsString() endsAt?: string | null;
}

@Controller('admin/notices')
@UseGuards(AdminJwtGuard)
export class NoticesController {
  constructor(private service: NoticesService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.service.list({
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
  }
  @Post() create(@Body() body: CreateNoticeBody) { return this.service.create(body); }
  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: UpdateNoticeBody) { return this.service.update(id, body); }
  @Delete(':id') @HttpCode(204) remove(@Param('id') id: string) { return this.service.remove(id); }
}

@Controller('public/notices')
export class PublicNoticesController {
  constructor(private service: NoticesService) {}
  @Get() list(@Query('language') language?: string) { return this.service.listPublicActive(language); }
}
