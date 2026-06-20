import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private service: DashboardService) {}
  @Get('stats') getStats() { return this.service.getStats(); }
  @Get('recent-activity') getRecentActivity(@Query('limit') limit?: string) {
    return this.service.getRecentActivity(limit ? +limit : 20);
  }
  @Get('submission-trends') getSubmissionTrends() { return this.service.getSubmissionTrends(); }
}
