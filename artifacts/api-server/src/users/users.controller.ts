import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { UserStatus } from '@prisma/client';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

class UpdateUserBody {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
}

class UpdateUserStatusBody {
  @IsEnum(UserStatus) status!: UserStatus;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private service: UsersService) {}

  @Get('me')
  getMe(@Request() req: { user: { sub: string } }) {
    return this.service.findOne(req.user.sub);
  }

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: UserStatus,
  ) {
    return this.service.list({ page: page ? +page : 1, limit: limit ? +limit : 20, search, status });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateUserBody) {
    return this.service.update(id, body);
  }

  @Patch(':id/status')
  @UseGuards(AdminJwtGuard)
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateUserStatusBody,
    @Request() req: { user: JwtPayload },
  ) {
    return this.service.updateStatus(
      id,
      body.status,
      req.user.email ?? req.user.sub,
      req.user.sub,
    );
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
