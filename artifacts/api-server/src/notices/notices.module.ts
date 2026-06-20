import { Module } from '@nestjs/common';
import { NoticesController, PublicNoticesController } from './notices.controller';
import { NoticesService } from './notices.service';

@Module({
  controllers: [NoticesController, PublicNoticesController],
  providers: [NoticesService],
})
export class NoticesModule {}
