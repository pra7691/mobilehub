import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, UseGuards } from '@nestjs/common';
import { SubcategoriesService } from './subcategories.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class CreateSubcategoryBody {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() categoryId!: string;
  @IsOptional() @IsNumber() @Type(() => Number) displayOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class UpdateSubcategoryBody {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsNumber() @Type(() => Number) displayOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Controller('subcategories')
@UseGuards(JwtAuthGuard)
export class SubcategoriesController {
  constructor(private service: SubcategoriesService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.service.list({
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
      search,
      categoryId,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
  }

  @Post() create(@Body() body: CreateSubcategoryBody) { return this.service.create(body); }
  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: UpdateSubcategoryBody) { return this.service.update(id, body); }
  @Delete(':id') @HttpCode(204) remove(@Param('id') id: string) { return this.service.remove(id); }
}
