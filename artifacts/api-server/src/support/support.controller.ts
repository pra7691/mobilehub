import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { SupportService } from './support.service';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { IsString, IsOptional } from 'class-validator';

class UpdateSupportBody {
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() whatsappNumber?: string;
  @IsOptional() @IsString() phoneNumber?: string;
  @IsOptional() @IsString() workingHours?: string;
  @IsOptional() @IsString() message?: string;
}

@Controller('admin/support-settings')
@UseGuards(AdminJwtGuard)
export class SupportController {
  constructor(private service: SupportService) {}
  @Get() get() { return this.service.get(); }
  @Patch() update(@Body() body: UpdateSupportBody) { return this.service.update(body); }
}

@Controller('public/support')
export class PublicSupportController {
  constructor(private service: SupportService) {}
  @Get() get() { return this.service.get(); }
}
