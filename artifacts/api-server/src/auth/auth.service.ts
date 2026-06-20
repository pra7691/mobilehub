import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

const JWT_SECRET = process.env.JWT_SECRET || 'capto-jwt-secret-change-in-production';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private issueTokens(payload: object) {
    const accessToken = this.jwtService.sign(payload, {
      secret: JWT_SECRET,
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: JWT_SECRET,
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });
    return { accessToken, refreshToken, expiresIn: 900 };
  }

  async adminLogin(dto: AdminLoginDto) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
    });

    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, admin.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokens({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      type: 'admin',
    });
  }

  async requestOtp(dto: RequestOtpDto) {
    // Find or create user by phone number
    let user = await this.prisma.user.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: { phoneNumber: dto.phoneNumber },
      });
    }

    // Check OTP settings for test mode
    const settings = await this.prisma.otpSetting.findFirst();
    const otp = settings?.isTestMode && settings.testOtp
      ? settings.testOtp
      : Math.random().toString().slice(2, 8);
    const expirySeconds = settings?.otpExpirySeconds ?? 300;

    const session = await this.prisma.otpSession.create({
      data: {
        userId: user.id,
        phoneNumber: dto.phoneNumber,
        otp,
        expiresAt: new Date(Date.now() + expirySeconds * 1000),
      },
    });

    // In production: send SMS here
    console.log(`[DEV] OTP for ${dto.phoneNumber}: ${otp}`);

    return { message: 'OTP sent successfully', sessionId: session.id };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const session = await this.prisma.otpSession.findUnique({
      where: { id: dto.sessionId },
      include: { user: true },
    });

    if (!session) {
      throw new BadRequestException('Invalid session');
    }
    if (session.verified) {
      throw new BadRequestException('OTP already used');
    }
    if (new Date() > session.expiresAt) {
      throw new BadRequestException('OTP expired');
    }
    if (session.otp !== dto.otp) {
      await this.prisma.otpSession.update({
        where: { id: session.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid OTP');
    }

    await this.prisma.otpSession.update({
      where: { id: session.id },
      data: { verified: true },
    });

    const user = session.user;
    if (!user) throw new NotFoundException('User not found');

    return this.issueTokens({
      sub: user.id,
      phoneNumber: user.phoneNumber,
      type: 'user',
    });
  }

  async refreshTokens(dto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify(dto.refreshToken, {
        secret: JWT_SECRET,
      });
      const { iat, exp, ...rest } = payload as Record<string, unknown>;
      void iat; void exp;
      return this.issueTokens(rest);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
