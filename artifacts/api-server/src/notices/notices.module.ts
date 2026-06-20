import { Module } from '@nestjs/common';
import { NoticesController, PublicNoticesController } from './notices.controller';
import { NoticesService } from './notices.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [NoticesController, PublicNoticesController],
  providers: [NoticesService],
})
export class NoticesModule {}
