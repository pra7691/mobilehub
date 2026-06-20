import { Module } from '@nestjs/common';
import { FaqController, PublicFaqController } from './faq.controller';
import { FaqService } from './faq.service';

@Module({
  controllers: [FaqController, PublicFaqController],
  providers: [FaqService],
})
export class FaqModule {}
