import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { BannersService } from './banners.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsOptional, IsIn } from 'class-validator';

class ListPublicBannersQuery {
  @IsOptional() @IsIn(['en', 'hi']) language?: 'en' | 'hi';
}

@Controller('banners')
@UseGuards(JwtAuthGuard)
export class BannersController {
  constructor(private service: BannersService) {}

  @Get()
  list(@Query() query: ListPublicBannersQuery) {
    return this.service.listPublic(query.language ?? 'en');
  }
}
