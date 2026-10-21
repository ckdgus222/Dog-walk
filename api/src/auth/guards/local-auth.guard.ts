import {
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { LoginDto } from '../dto/login.dto.js';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    // Passport runs before the global validation pipe.
    request.body = await new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }).transform(request.body, { type: 'body', metatype: LoginDto });
    return super.canActivate(context) as Promise<boolean>;
  }

  handleRequest<TUser>(
    error: unknown,
    user: TUser | false | null | undefined,
  ): TUser {
    if (error) throw error;
    if (!user)
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    return user;
  }
}
