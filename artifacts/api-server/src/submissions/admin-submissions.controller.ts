import { Controller, Get, Post, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

interface AdminRequest { user: JwtPayload }

@Controller('admin/submissions')
@UseGuards(AdminJwtGuard)
export class AdminSubmissionsController {
  constructor(private service: SubmissionsService) {}

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
      status, collectionType, categoryId, subcategoryId, userId, search,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.adminFindOne(id);
  }

  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @Req() req: AdminRequest,
    @Body() body: { approvedAmount?: number; adminNote?: string },
  ) {
    return this.service.approve(id, req.user.email ?? req.user.sub, body);
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Req() req: AdminRequest,
    @Body() body: { rejectionReason: string; adminNote?: string },
  ) {
    return this.service.reject(id, req.user.email ?? req.user.sub, body);
  }

  @Post(':id/request-resubmission')
  requestResubmission(
    @Param('id') id: string,
    @Req() req: AdminRequest,
    @Body() body: { resubmissionReason: string },
  ) {
    return this.service.requestResubmission(id, req.user.email ?? req.user.sub, body);
  }
}
