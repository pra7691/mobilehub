import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { TaskStatus } from '@prisma/client';

class CreateTaskBody {
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() instructions?: string;
  @IsString() categoryId!: string;
  @IsOptional() @IsString() subcategoryId?: string;
  @IsNumber() @Type(() => Number) reward!: number;
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
}
class UpdateTaskBody {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() subcategoryId?: string;
  @IsOptional() @IsNumber() @Type(() => Number) reward?: number;
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
}

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private service: TasksService) {}
  @Get() list(@Query('page') page?: string, @Query('limit') limit?: string, @Query('search') search?: string, @Query('categoryId') categoryId?: string, @Query('subcategoryId') subcategoryId?: string, @Query('status') status?: TaskStatus) {
    return this.service.list({ page: page ? +page : 1, limit: limit ? +limit : 20, search, categoryId, subcategoryId, status });
  }
  @Post() create(@Body() body: CreateTaskBody) { return this.service.create(body); }
  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: UpdateTaskBody) { return this.service.update(id, body); }
  @Delete(':id') @HttpCode(204) remove(@Param('id') id: string) { return this.service.remove(id); }
}
