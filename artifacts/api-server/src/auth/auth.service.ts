import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { generateUniqueReferralCode } from '../referrals/referrals.service';
import { normalizeIndianPhone } from '../common/phone.util';

const JWT_SECRET = process.env.JWT_SECRET || 'capto-jwt-secret-change-in-production';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_SEC = 7 * 24 * 60 * 60;
const REFRESH_TOKEN_EXPIRY = '7d';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface AuthContext {
  ipAddress?: string;
  requestId?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private audit: AuditService,
  ) {}

  private async issueUserTokens(payload: object, userId: string) {
    const accessToken = this.jwtService.sign(payload, {
      secret: JWT_SECRET,
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: JWT_SECRET,
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });

    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SEC * 1000);
    await this.prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });

    // Clean up expired tokens (best-effort, non-blocking)
    this.prisma.refreshToken
      .deleteMany({ where: { userId, expiresAt: { lt: new Date() } } })
      .catch(() => {});

    return { accessToken, refreshToken, expiresIn: 900 };
  }

  private issueAdminTokens(payload: Record<string, unknown>) {
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

  async adminLogin(dto: AdminLoginDto, ctx?: AuthContext) {
    const admin = await this.prisma.adminUser.findUnique({ where: { email: dto.email } });

    if (!admin || !admin.isActive || admin.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, admin.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    void this.audit.log('admin.login', {
      adminId: admin.id,
      adminEmail: admin.email,
      ipAddress: ctx?.ipAddress,
      requestId: ctx?.requestId,
    });

    return this.issueAdminTokens({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      type: 'admin',
      tv: admin.tokenVersion,
    });
  }

  async adminLogout(adminId: string, ctx?: AuthContext) {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminId } });
    void this.audit.log('admin.logout', {
      adminId,
      adminEmail: admin?.email,
      ipAddress: ctx?.ipAddress,
      requestId: ctx?.requestId,
    });
    return { message: 'Logged out' };
  }

  async adminLogoutAll(adminId: string, ctx?: AuthContext) {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin) throw new NotFoundException('Admin not found');

    await this.prisma.adminUser.update({
      where: { id: adminId },
      data: { tokenVersion: { increment: 1 } },
    });

    void this.audit.log('admin.logout_all', {
      adminId,
      adminEmail: admin.email,
      ipAddress: ctx?.ipAddress,
      requestId: ctx?.requestId,
    });

    return { message: 'All sessions invalidated' };
  }

  async requestOtp(dto: RequestOtpDto) {
    const phoneNumber = normalizeIndianPhone(dto.phoneNumber);
    let user = await this.prisma.user.findUnique({ where: { phoneNumber } });

    if (!user) {
      const referralCode = await generateUniqueReferralCode(this.prisma);
      user = await this.prisma.user.create({
        data: { phoneNumber, referralCode },
      });
    } else if (!user.referralCode) {
      // Backfill missing referral code for existing users
      const referralCode = await generateUniqueReferralCode(this.prisma);
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { referralCode },
      });
    }

    if (user.status === 'suspended') throw new BadRequestException('Account suspended');
    if (user.status === 'disabled') {
      throw new HttpException(
        { statusCode: HttpStatus.FORBIDDEN, code: 'USER_ACCOUNT_DISABLED', message: 'Your account is disabled.' },
        HttpStatus.FORBIDDEN,
      );
    }

    const settings = await this.prisma.otpSetting.findFirst();

    // Cooldown: prevent rapid OTP requests
    const cooldown = settings?.cooldownSeconds ?? 60;
    const recent = await this.prisma.otpSession.findFirst({
      where: {
        phoneNumber,
        createdAt: { gte: new Date(Date.now() - cooldown * 1000) },
        verified: false,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      throw new BadRequestException('Please wait before requesting another OTP');
    }

    const otp =
      settings?.isTestMode && settings.testOtp
        ? settings.testOtp
        : Math.floor(100000 + Math.random() * 900000).toString();
    const expirySeconds = settings?.otpExpirySeconds ?? 300;

    const session = await this.prisma.otpSession.create({
      data: {
        userId: user.id,
        phoneNumber,
        otp,
        expiresAt: new Date(Date.now() + expirySeconds * 1000),
      },
    });

    // TODO: Integrate a real SMS gateway before broad public rollout.
    // Replace this section with a call to your SMS provider (e.g., MSG91, Kaleyra, Twilio, AWS SNS).
    // The test OTP (configured via Admin → OTP Settings → Test Mode) is ONLY for:
    //   - Internal testing and Google Play Store reviewer access.
    // Disable test mode in Admin → OTP Settings before releasing to real end-users.
    // IMPORTANT: Never log or expose OTP values in production logs or UI.
    if (process.env.NODE_ENV !== 'production') {
      // DEV-ONLY: Log OTP to console. This branch is never reached in production.
      console.log(`[DEV] OTP for ${phoneNumber}: ${otp}`);
    }

    return { message: 'OTP sent successfully', sessionId: session.id };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const session = await this.prisma.otpSession.findUnique({
      where: { id: dto.sessionId },
      include: { user: true },
    });

    if (!session) throw new BadRequestException('Invalid session');
    if (session.verified) throw new BadRequestException('OTP already used');
    if (new Date() > session.expiresAt) throw new BadRequestException('OTP expired');

    const settings = await this.prisma.otpSetting.findFirst();
    const maxAttempts = settings?.maxAttempts ?? 3;
    if (session.attempts >= maxAttempts) {
      throw new BadRequestException('Too many attempts — request a new OTP');
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
    if (user.status === 'suspended') throw new UnauthorizedException('Account suspended');
    if (user.status === 'disabled') {
      throw new HttpException(
        { statusCode: HttpStatus.FORBIDDEN, code: 'USER_ACCOUNT_DISABLED', message: 'Your account is disabled.' },
        HttpStatus.FORBIDDEN,
      );
    }

    return this.issueUserTokens(
      { sub: user.id, phoneNumber: user.phoneNumber, type: 'user' },
      user.id,
    );
  }

  async refreshTokens(dto: RefreshTokenDto) {
    let payload: Record<string, unknown>;
    try {
      payload = this.jwtService.verify(dto.refreshToken, { secret: JWT_SECRET }) as Record<string, unknown>;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const type = payload['type'];

    if (type === 'user') {
      const tokenHash = hashToken(dto.refreshToken);
      const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

      if (!stored || stored.isRevoked || stored.expiresAt < new Date()) {
        throw new UnauthorizedException('Refresh token revoked or expired');
      }

      // Rotate: mark old token revoked, issue new pair
      await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { isRevoked: true } });

      const { iat: _iat, exp: _exp, ...rest } = payload;
      void _iat; void _exp;
      return this.issueUserTokens(rest, stored.userId);
    }

    if (type === 'admin') {
      const adminId = payload['sub'] as string;
      const tv = payload['tv'] as number | undefined;
      const admin = await this.prisma.adminUser.findUnique({ where: { id: adminId } });
      if (!admin || !admin.isActive || admin.deletedAt) {
        throw new UnauthorizedException('Admin account not found or inactive');
      }
      if (tv !== admin.tokenVersion) {
        throw new UnauthorizedException('Session invalidated — please log in again');
      }
      const { iat: _iat, exp: _exp, ...rest } = payload;
      void _iat; void _exp;
      return this.issueAdminTokens({ ...rest, tv: admin.tokenVersion });
    }

    throw new UnauthorizedException('Invalid token type');
  }

  async revokeUserRefreshToken(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken
      .update({ where: { tokenHash }, data: { isRevoked: true } })
      .catch(() => {});
  }
}
