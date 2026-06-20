import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, UseGuards } from '@nestjs/common';
import { FaqService } from './faq.service';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { IsString, IsOptional, IsBoolean, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class CreateFaqBody {
  @IsString() question!: string;
  @IsString() answer!: string;
  @IsOptional() @IsNumber() @Type(() => Number) displayOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class UpdateFaqBody {
  @IsOptional() @IsString() question?: string;
  @IsOptional() @IsString() answer?: string;
  @IsOptional() @IsNumber() @Type(() => Number) displayOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class ReorderItem {
  @IsString() id!: string;
  @IsNumber() @Type(() => Number) displayOrder!: number;
}

class ReorderBody {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReorderItem) items!: ReorderItem[];
}

@Controller('admin/faq')
@UseGuards(AdminJwtGuard)
export class FaqController {
  constructor(private service: FaqService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.service.listAdmin({
      page: page ? +page : 1,
      limit: limit ? +limit : 50,
      search,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
  }

  @Post() create(@Body() body: CreateFaqBody) { return this.service.create(body); }
  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: UpdateFaqBody) { return this.service.update(id, body); }
  @Delete(':id') @HttpCode(204) remove(@Param('id') id: string) { return this.service.remove(id); }
  @Post('reorder') reorder(@Body() body: ReorderBody) { return this.service.reorder(body.items); }
}

@Controller('public/faq')
export class PublicFaqController {
  constructor(private service: FaqService) {}
  @Get() list(@Query('search') search?: string) { return this.service.listPublic(search); }
}
