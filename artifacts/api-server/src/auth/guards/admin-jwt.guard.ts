import { Injectable, UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { JwtPayload } from '../strategies/jwt.strategy';

@Injectable()
export class AdminJwtGuard extends AuthGuard('jwt') {
  handleRequest<T extends JwtPayload>(err: Error | null, user: T | false): T {
    if (err || !user) throw new UnauthorizedException();
    if (user.type !== 'admin') throw new UnauthorizedException('Admin access required');
    return user;
  }
}
