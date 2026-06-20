import { Module } from '@nestjs/common';
import { PagesController, PublicPagesController } from './pages.controller';
import { PagesService } from './pages.service';

@Module({
  controllers: [PagesController, PublicPagesController],
  providers: [PagesService],
})
export class PagesModule {}
