import { Controller, Get, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SubmissionStatus } from '@prisma/client';

class UpdateStatusBody {
  @IsEnum(SubmissionStatus) status!: SubmissionStatus;
  @IsOptional() @IsString() reviewNote?: string;
}

@Controller('submissions')
@UseGuards(JwtAuthGuard)
export class SubmissionsController {
  constructor(private service: SubmissionsService) {}
  @Get() list(@Query('page') page?: string, @Query('limit') limit?: string, @Query('taskId') taskId?: string, @Query('userId') userId?: string, @Query('status') status?: SubmissionStatus) {
    return this.service.list({ page: page ? +page : 1, limit: limit ? +limit : 20, taskId, userId, status });
  }
  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @Patch(':id/status') updateStatus(@Param('id') id: string, @Body() body: UpdateStatusBody) {
    return this.service.updateStatus(id, body.status, body.reviewNote);
  }
}
