import { Controller, Post, UseGuards, Body } from '@nestjs/common';
import { StorageService } from './storage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequestUploadUrlDto } from './storage.dto';

@Controller('storage')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(private service: StorageService) {}

  @Post('uploads/request-url')
  async requestUploadUrl(@Body() _body: RequestUploadUrlDto) {
    return this.service.getUploadUrl();
  }
}
