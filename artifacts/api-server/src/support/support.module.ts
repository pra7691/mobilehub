import { Module } from '@nestjs/common';
import { SupportController, PublicSupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  controllers: [SupportController, PublicSupportController],
  providers: [SupportService],
})
export class SupportModule {}
