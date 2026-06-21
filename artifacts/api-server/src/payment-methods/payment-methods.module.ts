import { Module } from '@nestjs/common';
import { PaymentMethodsService } from './payment-methods.service';
import {
  PaymentMethodsController,
  AdminPaymentMethodsController,
} from './payment-methods.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PaymentMethodsController, AdminPaymentMethodsController],
  providers: [PaymentMethodsService],
  exports: [PaymentMethodsService],
})
export class PaymentMethodsModule {}
