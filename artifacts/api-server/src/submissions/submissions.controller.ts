import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsArray, IsEnum, IsOptional, IsString, ArrayMinSize } from 'class-validator';
import { SubmissionStatus } from '@prisma/client';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

class UpdateStatusBody {
  @IsEnum(SubmissionStatus) status!: SubmissionStatus;
  @IsOptional() @IsString() reviewNote?: string;
}

class CreateSubmissionBody {
  @IsString() taskId!: string;
  @IsArray() @IsString({ each: true }) @ArrayMinSize(1) mediaUrls!: string[];
}

@Controller('submissions')
@UseGuards(JwtAuthGuard)
export class SubmissionsController {
  constructor(private service: SubmissionsService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('taskId') taskId?: string,
    @Query('userId') userId?: string,
    @Query('status') status?: SubmissionStatus,
    @Req() req?: { user: JwtPayload },
  ) {
    const user = req?.user;
    const effectiveUserId = user?.type === 'user' ? user.sub : userId;
    return this.service.list({ page: page ? +page : 1, limit: limit ? +limit : 20, taskId, userId: effectiveUserId, status });
  }

  @Post()
  create(@Req() req: { user: JwtPayload }, @Body() body: CreateSubmissionBody) {
    if (req.user.type !== 'user') {
      throw new ForbiddenException('Only mobile users can submit');
    }
    return this.service.create(req.user.sub, body.taskId, body.mediaUrls);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: UpdateStatusBody) {
    return this.service.updateStatus(id, body.status, body.reviewNote);
  }
}
