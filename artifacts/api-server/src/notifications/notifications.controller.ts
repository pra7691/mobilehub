import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RegisterDeviceDto, UpdatePreferencesDto } from './dto/register-device.dto';
import { NotificationsService } from './notifications.service';

interface AuthRequest {
  user: { id: string };
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Post('register-device')
  registerDevice(@Req() req: AuthRequest, @Body() dto: RegisterDeviceDto) {
    return this.service.registerDevice(req.user.id, dto);
  }

  @Delete('unregister-device')
  unregisterDevice(@Req() req: AuthRequest, @Query('token') token: string) {
    return this.service.unregisterDevice(req.user.id, token);
  }

  @Patch('preferences')
  updatePreferences(@Req() req: AuthRequest, @Body() dto: UpdatePreferencesDto) {
    return this.service.updatePreferences(req.user.id, dto);
  }

  @Get('my')
  listMy(
    @Req() req: AuthRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listMy(req.user.id, {
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
    });
  }

  @Patch(':id/read')
  markRead(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.markRead(req.user.id, id);
  }
}
