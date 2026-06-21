import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { IsString, IsNotEmpty, IsNumber, IsPositive, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PayoutStatus } from '@prisma/client';

interface AuthRequest { user: JwtPayload }
interface AdminRequest { user: { sub: string; email?: string } }

class CreatePayoutRequestDto {
  @IsNumber() @IsPositive() @Type(() => Number) amount!: number;
  @IsString() @IsNotEmpty() paymentMethodId!: string;
}

class AdminMarkPaidDto {
  @IsString() @IsNotEmpty() payoutReferenceId!: string;
  @IsOptional() @IsString() adminNote?: string;
}

class AdminRejectPayoutDto {
  @IsString() @IsNotEmpty() rejectionReason!: string;
  @IsOptional() @IsString() adminNote?: string;
}

@Controller('payouts')
@UseGuards(JwtAuthGuard)
export class PayoutsController {
  constructor(private service: PayoutsService) {}

  @Get('my')
  getMyPayouts(
    @Req() req: AuthRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: PayoutStatus,
  ) {
    return this.service.getMyPayouts(req.user.sub, {
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
      status,
    });
  }

  @Get('my/:id')
  getMyPayout(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.getMyPayout(req.user.sub, id);
  }

  @Post('request')
  @HttpCode(201)
  createPayoutRequest(@Req() req: AuthRequest, @Body() body: CreatePayoutRequestDto) {
    return this.service.createPayoutRequest(req.user.sub, body.amount, body.paymentMethodId);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancelPayout(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.cancelPayout(req.user.sub, id);
  }
}

@Controller('admin/payouts')
@UseGuards(AdminJwtGuard)
export class AdminPayoutsController {
  constructor(private service: PayoutsService) {}

  @Get()
  listPayouts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: PayoutStatus,
    @Query('upiVerificationStatus') upiVerificationStatus?: string,
    @Query('search') search?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('minAmount') minAmount?: string,
    @Query('maxAmount') maxAmount?: string,
  ) {
    return this.service.adminListPayouts({
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
      status,
      upiVerificationStatus,
      search,
      fromDate,
      toDate,
      minAmount: minAmount ? +minAmount : undefined,
      maxAmount: maxAmount ? +maxAmount : undefined,
    });
  }

  @Get(':id')
  getPayout(@Param('id') id: string, @Query('revealUpi') revealUpi?: string) {
    return this.service.adminGetPayout(id, revealUpi === 'true');
  }

  @Post(':id/start-processing')
  @HttpCode(200)
  startProcessing(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.service.adminStartProcessing(id, req.user.sub, req.user.email ?? req.user.sub);
  }

  @Post(':id/mark-paid')
  @HttpCode(200)
  markPaid(
    @Param('id') id: string,
    @Req() req: AdminRequest,
    @Body() body: AdminMarkPaidDto,
  ) {
    return this.service.adminMarkPaid(
      id,
      req.user.sub,
      req.user.email ?? req.user.sub,
      body.payoutReferenceId,
      body.adminNote,
    );
  }

  @Post(':id/reject')
  @HttpCode(200)
  rejectPayout(
    @Param('id') id: string,
    @Req() req: AdminRequest,
    @Body() body: AdminRejectPayoutDto,
  ) {
    return this.service.adminRejectPayout(
      id,
      req.user.sub,
      req.user.email ?? req.user.sub,
      body.rejectionReason,
      body.adminNote,
    );
  }
}
