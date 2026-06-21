import { Module } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { PayoutsController, AdminPayoutsController } from './payouts.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, AuditModule, NotificationsModule],
  controllers: [PayoutsController, AdminPayoutsController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
