import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

class MediaFileDto {
  @IsString() filename!: string;
  @IsOptional() @IsNumber() fileSize?: number;
  @IsOptional() @IsString() contentType?: string;
}

class InitiateSubmissionDto {
  @IsString() taskId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => MediaFileDto)
  mediaFiles!: MediaFileDto[];
  @IsOptional() @IsInt() durationSeconds?: number;
  @IsOptional() @IsInt() imageCount?: number;
  @IsOptional() @IsObject() captureMetadata?: object;
  @IsOptional() @IsString() captureStartedAt?: string;
  @IsOptional() @IsString() captureEndedAt?: string;
  @IsOptional() @IsString() devicePlatform?: string;
  @IsOptional() @IsString() deviceModel?: string;
  @IsOptional() @IsString() osVersion?: string;
  @IsOptional() @IsString() cameraUsed?: string;
  @IsOptional() @IsString() lensRequested?: string;
  @IsOptional() @IsString() orientation?: string;
}

class UploadedMediaDto {
  @IsString() mediaId!: string;
  @IsOptional() @IsNumber() fileSize?: number;
}

class UploadCompleteDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => UploadedMediaDto)
  uploadedMedia!: UploadedMediaDto[];
}

class UploadFailedDto {
  @IsOptional() @IsString() failureReason?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) failedMediaIds?: string[];
}

@Controller('submissions')
@UseGuards(JwtAuthGuard)
export class SubmissionsController {
  constructor(private service: SubmissionsService) {}

  // POST /submissions/initiate
  @Post('initiate')
  @HttpCode(HttpStatus.CREATED)
  initiate(@Req() req: { user: JwtPayload }, @Body() body: InitiateSubmissionDto) {
    return this.service.initiate(req.user.sub, body);
  }

  // POST /submissions/:id/upload-complete
  @Post(':id/upload-complete')
  @HttpCode(HttpStatus.OK)
  uploadComplete(
    @Req() req: { user: JwtPayload },
    @Param('id') id: string,
    @Body() body: UploadCompleteDto,
  ) {
    return this.service.uploadComplete(req.user.sub, id, body);
  }

  // POST /submissions/:id/upload-failed
  @Post(':id/upload-failed')
  @HttpCode(HttpStatus.OK)
  uploadFailed(
    @Req() req: { user: JwtPayload },
    @Param('id') id: string,
    @Body() body: UploadFailedDto,
  ) {
    return this.service.uploadFailed(req.user.sub, id, body);
  }

  // GET /submissions/my
  @Get('my')
  listMine(
    @Req() req: { user: JwtPayload },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listMine(req.user.sub, {
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      status,
    });
  }

  // GET /submissions/my/:id
  @Get('my/:id')
  findMine(@Req() req: { user: JwtPayload }, @Param('id') id: string) {
    return this.service.findMine(req.user.sub, id);
  }

  // DELETE /submissions/:id
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  delete(@Req() req: { user: JwtPayload }, @Param('id') id: string) {
    return this.service.deleteSubmission(req.user.sub, id);
  }
}
