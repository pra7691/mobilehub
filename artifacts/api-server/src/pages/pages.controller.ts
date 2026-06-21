import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, UseGuards } from '@nestjs/common';
import { PagesService } from './pages.service';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

class CreatePageBody {
  @IsString() title!: string;
  @IsString() slug!: string;
  @IsString() content!: string;
  @IsOptional() @IsString() titleEn?: string;
  @IsOptional() @IsString() titleHi?: string;
  @IsOptional() @IsString() contentEn?: string;
  @IsOptional() @IsString() contentHi?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}

class UpdatePageBody {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() titleEn?: string;
  @IsOptional() @IsString() titleHi?: string;
  @IsOptional() @IsString() contentEn?: string;
  @IsOptional() @IsString() contentHi?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}

@Controller('admin/pages')
@UseGuards(AdminJwtGuard)
export class PagesController {
  constructor(private service: PagesService) {}

  @Get() list(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.service.list({ page: page ? +page : 1, limit: limit ? +limit : 20 });
  }
  @Post() create(@Body() body: CreatePageBody) { return this.service.create(body); }
  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: UpdatePageBody) { return this.service.update(id, body); }
  @Delete(':id') @HttpCode(204) remove(@Param('id') id: string) { return this.service.remove(id); }
}

@Controller('public/pages')
export class PublicPagesController {
  constructor(private service: PagesService) {}
  @Get(':slug') findBySlug(@Param('slug') slug: string, @Query('language') language?: string) {
    return this.service.findBySlugPublic(slug, language);
  }
}
