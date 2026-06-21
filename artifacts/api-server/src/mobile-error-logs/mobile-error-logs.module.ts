import { Module } from '@nestjs/common';
import { MobileErrorLogsController, AdminMobileErrorLogsController } from './mobile-error-logs.controller';
import { MobileErrorLogsService } from './mobile-error-logs.service';

@Module({
  controllers: [MobileErrorLogsController, AdminMobileErrorLogsController],
  providers: [MobileErrorLogsService],
})
export class MobileErrorLogsModule {}
