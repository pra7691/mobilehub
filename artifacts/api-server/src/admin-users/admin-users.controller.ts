import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  UseGuards,
  Req,
  HttpStatus,
} from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import {
  IsEmail,
  IsString,
  MinLength,
  IsEnum,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { AdminRole } from '@prisma/client';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

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

class ChangePasswordBody {
  @IsString() currentPassword!: string;
  @IsString() @MinLength(8) newPassword!: string;
}

@Controller('admin-users')
@UseGuards(AdminJwtGuard)
export class AdminUsersController {
  constructor(private service: AdminUsersService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.service.list({ page: page ? +page : 1, limit: limit ? +limit : 20, search });
  }

  @Post()
  create(@Body() body: CreateAdminUserBody) {
    return this.service.create(body);
  }

  @Post('me/change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @Req() req: { user: JwtPayload },
    @Body() body: ChangePasswordBody,
  ) {
    return this.service.changePassword(req.user.sub, body);
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
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
