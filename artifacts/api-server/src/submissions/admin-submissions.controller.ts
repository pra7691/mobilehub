import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { SubmissionsService } from './submissions.service';
import { AuditService } from '../audit/audit.service';

class ApproveSubmissionDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  approvedAmount?: number;

  @IsOptional()
  @IsString()
  adminNote?: string;
}

class RejectSubmissionDto {
  @IsNotEmpty()
  @IsString()
  rejectionReason!: string;

  @IsOptional()
  @IsString()
  adminNote?: string;
}

class RequestResubmissionDto {
  @IsNotEmpty()
  @IsString()
  resubmissionReason!: string;
}

@Controller('admin/submissions')
@UseGuards(AdminJwtGuard)
export class AdminSubmissionsController {
  constructor(
    private service: SubmissionsService,
    private audit: AuditService,
  ) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('collectionType') collectionType?: string,
    @Query('categoryId') categoryId?: string,
    @Query('subcategoryId') subcategoryId?: string,
    @Query('userId') userId?: string,
    @Query('search') search?: string,
  ) {
    return this.service.adminList({
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      status,
      collectionType,
      categoryId,
      subcategoryId,
      userId,
      search,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.adminFindOne(id);
  }

  @Post(':id/approve')
  async approve(
    @Param('id') id: string,
    @Body() body: ApproveSubmissionDto,
    @Request() req: { user: { sub: string; email?: string } },
  ) {
    const result = await this.service.approve(id, req.user.email ?? req.user.sub, body);
    void this.audit.log(
      'submission.reviewed',
      { adminId: req.user.sub, adminEmail: req.user.email },
      { entityType: 'submission', entityId: id, metadata: { action: 'approve', approvedAmount: body.approvedAmount } },
    );
    return result;
  }

  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: RejectSubmissionDto,
    @Request() req: { user: { sub: string; email?: string } },
  ) {
    const result = await this.service.reject(id, req.user.email ?? req.user.sub, body);
    void this.audit.log(
      'submission.reviewed',
      { adminId: req.user.sub, adminEmail: req.user.email },
      { entityType: 'submission', entityId: id, metadata: { action: 'reject', rejectionReason: body.rejectionReason } },
    );
    return result;
  }

  @Post(':id/request-resubmission')
  async requestResubmission(
    @Param('id') id: string,
    @Body() body: RequestResubmissionDto,
    @Request() req: { user: { sub: string; email?: string } },
  ) {
    const result = await this.service.requestResubmission(id, req.user.email ?? req.user.sub, body);
    void this.audit.log(
      'submission.reviewed',
      { adminId: req.user.sub, adminEmail: req.user.email },
      { entityType: 'submission', entityId: id, metadata: { action: 'request_resubmission', resubmissionReason: body.resubmissionReason } },
    );
    return result;
  }
}
