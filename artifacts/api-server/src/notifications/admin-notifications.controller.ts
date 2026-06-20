import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { NotificationsService } from './notifications.service';

@Controller('admin/notifications')
@UseGuards(AdminJwtGuard)
export class AdminNotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('userId') userId?: string,
    @Query('isRead') isRead?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.adminList({
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
      type,
      userId,
      isRead: isRead !== undefined ? isRead === 'true' : undefined,
      from,
      to,
    });
  }
}
