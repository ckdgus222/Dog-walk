import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from './auth.service.js';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {
    super({ usernameField: 'email' });
  }

  validate(email: string, password: string) {
    return this.auth.validateUser(email, password);
  }
}
