import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';

@Controller('admin/submissions')
@UseGuards(AdminJwtGuard)
export class AdminSubmissionsController {
  constructor(private service: SubmissionsService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('collectionType') collectionType?: string,
    @Query('categoryId') categoryId?: string,
    @Query('subcategoryId') subcategoryId?: string,
    @Query('userId') userId?: string,
    @Query('search') search?: string,
  ) {
    return this.service.adminList({
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      status,
      collectionType,
      categoryId,
      subcategoryId,
      userId,
      search,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.adminFindOne(id);
  }
}
