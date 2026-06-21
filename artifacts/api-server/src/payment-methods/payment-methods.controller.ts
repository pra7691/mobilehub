import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PaymentMethodsService } from './payment-methods.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { IsString, IsNotEmpty } from 'class-validator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

interface AuthRequest { user: JwtPayload }

class UpiDto {
  @IsString() @IsNotEmpty() upiId!: string;
}

@Controller('payment-methods')
@UseGuards(JwtAuthGuard)
export class PaymentMethodsController {
  constructor(private service: PaymentMethodsService) {}

  @Get('me')
  getMyPaymentMethods(@Req() req: AuthRequest) {
    return this.service.getMyPaymentMethods(req.user.sub);
  }

  @Get('me/full/:id')
  getMyPaymentMethodFull(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.getMyPaymentMethodWithFullUpi(req.user.sub, id);
  }

  @Post('upi')
  addUpiPaymentMethod(@Req() req: AuthRequest, @Body() body: UpiDto) {
    return this.service.addOrUpdateUpiPaymentMethod(req.user.sub, body.upiId);
  }

  @Patch('upi/:id')
  updateUpiPaymentMethod(
    @Req() req: AuthRequest,
    @Param('id') _id: string,
    @Body() body: UpiDto,
  ) {
    return this.service.addOrUpdateUpiPaymentMethod(req.user.sub, body.upiId);
  }
}

@Controller('admin/payment-methods')
@UseGuards(AdminJwtGuard)
export class AdminPaymentMethodsController {
  constructor(private service: PaymentMethodsService) {}

  @Get(':id')
  getPaymentMethod(@Param('id') id: string) {
    return this.service.adminGetPaymentMethod(id);
  }
}
