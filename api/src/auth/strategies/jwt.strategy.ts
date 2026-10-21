import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(UsersService) private readonly users: UsersService) {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) throw new Error('JWT_ACCESS_SECRET is required');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
      algorithms: ['HS256'],
    });
  }

  async validate(payload: { sub?: unknown }) {
    if (
      typeof payload.sub !== 'number' ||
      !Number.isSafeInteger(payload.sub) ||
      payload.sub <= 0
    ) {
      throw new UnauthorizedException();
    }
    const user = await this.users.findPublicById(payload.sub);
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
