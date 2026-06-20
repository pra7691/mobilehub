import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminNotificationsController } from './admin-notifications.controller';
import { ExpoPushService } from './expo-push.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [NotificationsService, ExpoPushService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
