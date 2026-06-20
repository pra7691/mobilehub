import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { WalletService, ListTxParams } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { TransactionType, TransactionSourceType, TransactionStatus } from '@prisma/client';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

interface AuthRequest { user: JwtPayload }

@Controller()
export class WalletController {
  constructor(private service: WalletService) {}

  // ─── User: GET /wallet/me ─────────────────────────────────────────────────
  @Get('wallet/me')
  @UseGuards(JwtAuthGuard)
  getMyWallet(@Req() req: AuthRequest) {
    return this.service.getOrCreateByUserId(req.user.sub);
  }

  // ─── User: GET /wallet-transactions/my ───────────────────────────────────
  @Get('wallet-transactions/my')
  @UseGuards(JwtAuthGuard)
  listMyTransactions(
    @Req() req: AuthRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: TransactionType,
  ) {
    return this.service.listUserTransactions(req.user.sub, {
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
      type,
    });
  }

  // ─── Admin: GET /wallets/:userId ──────────────────────────────────────────
  @Get('wallets/:userId')
  @UseGuards(JwtAuthGuard)
  getWallet(@Param('userId') userId: string) {
    return this.service.getByUserId(userId);
  }

  // ─── Admin: GET /wallet-transactions ─────────────────────────────────────
  @Get('wallet-transactions')
  @UseGuards(AdminJwtGuard)
  listTransactions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
    @Query('type') type?: TransactionType,
    @Query('sourceType') sourceType?: TransactionSourceType,
    @Query('status') status?: TransactionStatus,
    @Query('sourceId') sourceId?: string,
    @Query('search') search?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const params: ListTxParams = {
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
      userId, type, sourceType, status, sourceId, search, fromDate, toDate,
    };
    return this.service.listTransactions(params);
  }

  // ─── Admin: GET /wallet-transactions/:id ─────────────────────────────────
  @Get('wallet-transactions/:id')
  @UseGuards(AdminJwtGuard)
  getTransaction(@Param('id') id: string) {
    return this.service.getTransaction(id);
  }
}
