import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { ApplyReferralDto } from './dto/apply-referral.dto';
import { ValidateReferralDto } from './dto/validate-referral.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private service: ReferralsService) {}

  @Get('me')
  getMyReferralSummary(@Request() req: { user: { sub: string } }) {
    return this.service.getMyReferralSummary(req.user.sub);
  }

  @Get('me/history')
  getMyReferralHistory(
    @Request() req: { user: { sub: string } },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getMyReferralHistory(req.user.sub, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('validate')
  validateCode(
    @Body() body: ValidateReferralDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.service.validateCode(body.referralCode, req.user.sub);
  }

  @Post('apply')
  applyReferralCode(
    @Body() body: ApplyReferralDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.service.applyReferralCode(body.referralCode, req.user.sub);
  }
}
