import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';

@Controller('admin/audit-logs')
@UseGuards(AdminJwtGuard)
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('adminId') adminId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.audit.listLogs({
      page: page ? +page : 1,
      limit: limit ? +limit : 50,
      adminId,
      action,
      entityType,
      from,
      to,
    });
  }
}
