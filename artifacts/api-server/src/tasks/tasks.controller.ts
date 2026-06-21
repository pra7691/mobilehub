import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsString, IsOptional, IsNumber, IsEnum, IsBoolean, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { CollectionType, CameraPreference, LensPreference, OrientationRequirement, TaskStatus } from '@prisma/client';

class CreateTaskBody {
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() detailedInstructions?: string;
  @IsOptional() @IsString() titleEn?: string;
  @IsOptional() @IsString() titleHi?: string;
  @IsOptional() @IsString() shortDescriptionEn?: string;
  @IsOptional() @IsString() shortDescriptionHi?: string;
  @IsOptional() @IsString() detailedInstructionsEn?: string;
  @IsOptional() @IsString() detailedInstructionsHi?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) dosEn?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) dosHi?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) dontsEn?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) dontsHi?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) dos?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) donts?: string[];
  @IsString() categoryId!: string;
  @IsOptional() @IsString() subcategoryId?: string;
  @IsOptional() @IsEnum(CollectionType) collectionType?: CollectionType;
  @IsOptional() @IsNumber() @Type(() => Number) paymentAmount?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() sampleMediaUrl?: string;
  @IsOptional() @IsNumber() @Type(() => Number) minimumDurationSeconds?: number;
  @IsOptional() @IsNumber() @Type(() => Number) maximumDurationSeconds?: number;
  @IsOptional() @IsNumber() @Type(() => Number) minimumImageCount?: number;
  @IsOptional() @IsNumber() @Type(() => Number) maximumImageCount?: number;
  @IsOptional() @IsNumber() @Type(() => Number) preferredFps?: number;
  @IsOptional() @IsNumber() @Type(() => Number) minimumFps?: number;
  @IsOptional() @IsEnum(CameraPreference) preferredCamera?: CameraPreference;
  @IsOptional() @IsEnum(LensPreference) preferredLens?: LensPreference;
  @IsOptional() @IsEnum(OrientationRequirement) requiredOrientation?: OrientationRequirement;
  @IsOptional() @IsBoolean() audioRequired?: boolean;
  @IsOptional() @IsBoolean() pauseAllowed?: boolean;
  @IsOptional() @IsNumber() @Type(() => Number) maxSubmissionsPerUser?: number;
  @IsOptional() @IsNumber() @Type(() => Number) maxTotalSubmissions?: number;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsNumber() @Type(() => Number) displayOrder?: number;
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
}

class UpdateTaskBody {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() detailedInstructions?: string;
  @IsOptional() @IsString() titleEn?: string;
  @IsOptional() @IsString() titleHi?: string;
  @IsOptional() @IsString() shortDescriptionEn?: string;
  @IsOptional() @IsString() shortDescriptionHi?: string;
  @IsOptional() @IsString() detailedInstructionsEn?: string;
  @IsOptional() @IsString() detailedInstructionsHi?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) dosEn?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) dosHi?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) dontsEn?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) dontsHi?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) dos?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) donts?: string[];
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() subcategoryId?: string;
  @IsOptional() @IsEnum(CollectionType) collectionType?: CollectionType;
  @IsOptional() @IsNumber() @Type(() => Number) paymentAmount?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() sampleMediaUrl?: string;
  @IsOptional() @IsNumber() @Type(() => Number) minimumDurationSeconds?: number;
  @IsOptional() @IsNumber() @Type(() => Number) maximumDurationSeconds?: number;
  @IsOptional() @IsNumber() @Type(() => Number) minimumImageCount?: number;
  @IsOptional() @IsNumber() @Type(() => Number) maximumImageCount?: number;
  @IsOptional() @IsNumber() @Type(() => Number) preferredFps?: number;
  @IsOptional() @IsNumber() @Type(() => Number) minimumFps?: number;
  @IsOptional() @IsEnum(CameraPreference) preferredCamera?: CameraPreference;
  @IsOptional() @IsEnum(LensPreference) preferredLens?: LensPreference;
  @IsOptional() @IsEnum(OrientationRequirement) requiredOrientation?: OrientationRequirement;
  @IsOptional() @IsBoolean() audioRequired?: boolean;
  @IsOptional() @IsBoolean() pauseAllowed?: boolean;
  @IsOptional() @IsNumber() @Type(() => Number) maxSubmissionsPerUser?: number;
  @IsOptional() @IsNumber() @Type(() => Number) maxTotalSubmissions?: number;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsNumber() @Type(() => Number) displayOrder?: number;
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
}

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private service: TasksService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('subcategoryId') subcategoryId?: string,
    @Query('status') status?: TaskStatus,
    @Query('collectionType') collectionType?: CollectionType,
    @Query('language') language?: string,
  ) {
    return this.service.list({ page: page ? +page : 1, limit: limit ? +limit : 20, search, categoryId, subcategoryId, status, collectionType, language });
  }

  @Post() create(@Body() body: CreateTaskBody) { return this.service.create(body as any); }
  @Get(':id') findOne(@Param('id') id: string, @Query('language') language?: string) { return this.service.findOne(id, language); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: UpdateTaskBody) { return this.service.update(id, body); }
  @Post(':id/duplicate') duplicate(@Param('id') id: string) { return this.service.duplicate(id); }
  @Delete(':id') @HttpCode(204) remove(@Param('id') id: string) { return this.service.remove(id); }
}
