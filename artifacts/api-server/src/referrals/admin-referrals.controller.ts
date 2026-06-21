import { Controller, Get, Patch, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';

@Controller('admin/referrals')
@UseGuards(AdminJwtGuard)
export class AdminReferralsController {
  constructor(private service: ReferralsService) {}

  @Get('stats')
  getStats() {
    return this.service.adminStats();
  }

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('referralCode') referralCode?: string,
    @Query('referrerPhone') referrerPhone?: string,
    @Query('referredPhone') referredPhone?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.service.adminList({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
      referralCode,
      referrerPhone,
      referredPhone,
      fromDate,
      toDate,
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.adminGetOne(id);
  }

  @Patch(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Request() req: { user: { email: string } },
  ) {
    return this.service.adminCancel(id, req.user.email);
  }
}
