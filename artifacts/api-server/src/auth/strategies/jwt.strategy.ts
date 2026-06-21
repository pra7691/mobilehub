import { Injectable, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email?: string;
  phoneNumber?: string;
  role?: string;
  type: 'admin' | 'user';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'capto-jwt-secret-change-in-production',
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException();
    }
    if (payload.type === 'user') {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { status: true },
      });
      if (!user || user.status === 'disabled') {
        throw new HttpException(
          {
            statusCode: HttpStatus.FORBIDDEN,
            code: 'USER_ACCOUNT_DISABLED',
            message: 'Your account is disabled.',
          },
          HttpStatus.FORBIDDEN,
        );
      }
    }
    return payload;
  }
}
