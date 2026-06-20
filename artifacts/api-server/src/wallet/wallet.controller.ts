import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TransactionType } from '@prisma/client';

@Controller()
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private service: WalletService) {}

  @Get('wallets/:userId')
  getWallet(@Param('userId') userId: string) {
    return this.service.getByUserId(userId);
  }

  @Get('wallet-transactions')
  listTransactions(@Query('page') page?: string, @Query('limit') limit?: string, @Query('userId') userId?: string, @Query('type') type?: TransactionType) {
    return this.service.listTransactions({ page: page ? +page : 1, limit: limit ? +limit : 20, userId, type });
  }

  @Get('wallet-transactions/:id')
  getTransaction(@Param('id') id: string) {
    return this.service.getTransaction(id);
  }
}
