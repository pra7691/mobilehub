import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UploadSessionService } from './upload-session.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

class CreateUploadSessionDto {
  @IsOptional() @IsString() submissionId?: string;
  @IsString() mediaType!: string;
  @IsString() mimeType!: string;
  @IsOptional() @IsString() originalFileName?: string;
  @IsOptional() @IsNumber() fileSize?: number;
  @IsOptional() @IsInt() @Min(5 * 1024 * 1024) partSize?: number;
  @IsOptional() @IsArray() @IsInt({ each: true }) requestedPartNumbers?: number[];
}

class RefreshUrlsDto {
  @IsArray() @IsInt({ each: true }) partNumbers!: number[];
}

class CompletedPartDto {
  @IsInt() @Min(1) partNumber!: number;
  @IsString() etag!: string;
}

class CompleteUploadSessionDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompletedPartDto)
  parts?: CompletedPartDto[];

  @IsOptional() @IsString() submissionId?: string;
  @IsOptional() @IsInt() sortOrder?: number;
}

@Controller('upload-sessions')
@UseGuards(JwtAuthGuard)
export class UploadSessionController {
  constructor(private readonly service: UploadSessionService) {}

  // POST /upload-sessions
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: { user: JwtPayload },
    @Body() body: CreateUploadSessionDto,
  ) {
    return this.service.create(req.user.sub, body);
  }

  // GET /upload-sessions/:id
  @Get(':id')
  findOne(@Req() req: { user: JwtPayload }, @Param('id') id: string) {
    return this.service.findOne(req.user.sub, id);
  }

  // POST /upload-sessions/:id/refresh-urls
  @Post(':id/refresh-urls')
  @HttpCode(HttpStatus.OK)
  refreshUrls(
    @Req() req: { user: JwtPayload },
    @Param('id') id: string,
    @Body() body: RefreshUrlsDto,
  ) {
    return this.service.refreshUrls(req.user.sub, id, body);
  }

  // POST /upload-sessions/:id/complete
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @Req() req: { user: JwtPayload },
    @Param('id') id: string,
    @Body() body: CompleteUploadSessionDto,
  ) {
    return this.service.complete(req.user.sub, id, body);
  }

  // DELETE /upload-sessions/:id
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  abort(@Req() req: { user: JwtPayload }, @Param('id') id: string) {
    return this.service.abort(req.user.sub, id);
  }
}
