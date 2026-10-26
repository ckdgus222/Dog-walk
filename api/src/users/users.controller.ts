import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Patch,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JsonBodyGuard } from '../auth/guards/json-body.guard.js';
import { LoginLimiter } from '../auth/login-limiter.js';
import {
  REFRESH_COOKIE,
  REFRESH_COOKIE_MAX_AGE,
  refreshCookieOptions,
} from '../auth/refresh-cookie.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import {
  UsersService,
  WrongCurrentPasswordException,
  type PublicUser,
} from './users.service.js';

// Registered in AuthModule, because a password change issues a new refresh
// token and UsersModule cannot import AuthModule back.
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(LoginLimiter) private readonly limiter: LoginLimiter,
  ) {}

  @Get('me')
  me(@Req() request: Request & { user: PublicUser }) {
    return request.user;
  }

  // A new password ends every earlier refresh token; this browser gets the
  // new one, so it stays logged in.
  @Patch('me')
  @UseGuards(JsonBodyGuard)
  async update(
    @Req() request: Request & { user: PublicUser },
    @Body() body: UpdateUserDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (body.newPassword === undefined) {
      return this.users.update(request.user.id, body);
    }

    const key = `user:${request.user.id}`;
    if (!this.limiter.begin(key)) {
      throw new HttpException(
        {
          message:
            '비밀번호 확인 시도가 너무 많아요. 잠시 뒤에 다시 시도해 주세요.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    let refresh: Awaited<ReturnType<AuthService['newRefreshToken']>>;
    let user: PublicUser;
    try {
      refresh = await this.auth.newRefreshToken(request.user.id);
      user = await this.users.update(
        request.user.id,
        body,
        refresh.refreshTokenHash,
      );
    } catch (error) {
      if (error instanceof WrongCurrentPasswordException)
        this.limiter.failed(key);
      else this.limiter.release(key);
      throw error;
    }
    this.limiter.release(key);
    response.cookie(REFRESH_COOKIE, refresh.refreshToken, {
      ...refreshCookieOptions(),
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });
    return user;
  }
}
