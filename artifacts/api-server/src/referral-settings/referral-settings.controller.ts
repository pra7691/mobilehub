import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ReferralSettingsService } from './referral-settings.service';
import { UpdateReferralSettingsDto } from './dto/update-referral-settings.dto';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';

@Controller('admin/settings/referral')
@UseGuards(AdminJwtGuard)
export class ReferralSettingsController {
  constructor(private service: ReferralSettingsService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Patch()
  update(@Body() body: UpdateReferralSettingsDto) {
    return this.service.update(body);
  }
}
