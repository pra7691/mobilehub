import {
  Controller,
  Post,
  Body,
  HttpCode,
  UseGuards,
  Req,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import type { JwtPayload } from './strategies/jwt.strategy';
import { Request } from 'express';

function getIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    ''
  );
}

function getRequestId(req: Request): string {
  return (req as unknown as Record<string, unknown>)['requestId'] as string ?? '';
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  adminLogin(@Body() dto: AdminLoginDto, @Req() req: Request) {
    return this.authService.adminLogin(dto, {
      ipAddress: getIp(req),
      requestId: getRequestId(req),
    });
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('user/request-otp')
  @HttpCode(HttpStatus.OK)
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('user/verify-otp')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refreshTokens(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(@Body() body: { refreshToken?: string }) {
    if (body?.refreshToken) {
      await this.authService.revokeUserRefreshToken(body.refreshToken);
    }
  }

  @Post('admin/logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtGuard)
  adminLogout(@Req() req: Request & { user: JwtPayload }) {
    return this.authService.adminLogout(req.user.sub, {
      ipAddress: getIp(req),
      requestId: getRequestId(req),
    });
  }

  @Post('admin/logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtGuard)
  adminLogoutAll(@Req() req: Request & { user: JwtPayload }) {
    return this.authService.adminLogoutAll(req.user.sub, {
      ipAddress: getIp(req),
      requestId: getRequestId(req),
    });
  }
}
