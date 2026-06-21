import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { MobileErrorLogsService } from './mobile-error-logs.service';

class CreateErrorLogDto {
  @IsString() errorType!: string;
  @IsOptional() @IsString() errorCode?: string;
  @IsString() message!: string;
  @IsOptional() @IsString() stackTrace?: string;
  @IsOptional() @IsString() endpoint?: string;
  @IsOptional() @IsString() httpMethod?: string;
  @IsOptional() @IsNumber() httpStatus?: number;
  @IsOptional() @IsString() requestId?: string;
  @IsString() platform!: string;
  @IsOptional() @IsString() deviceModel?: string;
  @IsOptional() @IsString() osVersion?: string;
  @IsOptional() @IsString() appVersion?: string;
  @IsOptional() @IsString() networkState?: string;
  @IsOptional() @IsString() collectionType?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

class ResolveErrorLogDto {
  @IsOptional() @IsString() resolutionNote?: string;
}

@Controller('mobile-error-logs')
@UseGuards(JwtAuthGuard)
export class MobileErrorLogsController {
  constructor(private service: MobileErrorLogsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: { user: JwtPayload },
    @Body() body: CreateErrorLogDto,
  ) {
    return this.service.create(req.user.sub, body);
  }
}

@Controller('admin/mobile-error-logs')
@UseGuards(AdminJwtGuard)
export class AdminMobileErrorLogsController {
  constructor(private service: MobileErrorLogsService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('resolved') resolved?: string,
    @Query('errorType') errorType?: string,
    @Query('platform') platform?: string,
    @Query('userId') userId?: string,
  ) {
    const resolvedBool =
      resolved === 'true' ? true : resolved === 'false' ? false : undefined;
    return this.service.list({
      page: page ? +page : 1,
      limit: Math.min(limit ? +limit : 20, 100),
      resolved: resolvedBool,
      errorType,
      platform,
      userId,
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  @Patch(':id/resolve')
  resolve(
    @Param('id') id: string,
    @Req() req: { user: JwtPayload },
    @Body() body: ResolveErrorLogDto,
  ) {
    return this.service.resolve(id, req.user.sub, body.resolutionNote);
  }

  @Patch(':id/unresolve')
  unresolve(@Param('id') id: string) {
    return this.service.unresolve(id);
  }
}
