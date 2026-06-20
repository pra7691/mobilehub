import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, UseGuards } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsEmail, IsString, MinLength, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { AdminRole } from '@prisma/client';

class CreateAdminUserBody {
  @IsEmail() email!: string;
  @IsString() name!: string;
  @IsString() @MinLength(8) password!: string;
  @IsEnum(AdminRole) role!: AdminRole;
}

class UpdateAdminUserBody {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(AdminRole) role?: AdminRole;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MinLength(8) password?: string;
}

@Controller('admin-users')
@UseGuards(JwtAuthGuard)
export class AdminUsersController {
  constructor(private service: AdminUsersService) {}

  @Get()
  list(@Query('page') page?: string, @Query('limit') limit?: string, @Query('search') search?: string) {
    return this.service.list({ page: page ? +page : 1, limit: limit ? +limit : 20, search });
  }

  @Post()
  create(@Body() body: CreateAdminUserBody) {
    return this.service.create(body);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateAdminUserBody) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
