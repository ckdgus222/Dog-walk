import {
  Body,
  Controller,
  Get,
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
import {
  REFRESH_COOKIE,
  REFRESH_COOKIE_MAX_AGE,
  refreshCookieOptions,
} from '../auth/refresh-cookie.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersService, type PublicUser } from './users.service.js';

// Registered in AuthModule, because a password change issues a new refresh
// token and UsersModule cannot import AuthModule back.
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(AuthService) private readonly auth: AuthService,
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
    const refresh =
      body.newPassword === undefined
        ? undefined
        : await this.auth.newRefreshToken(request.user.id);
    const user = await this.users.update(
      request.user.id,
      body,
      refresh?.refreshTokenHash,
    );
    if (refresh) {
      response.cookie(REFRESH_COOKIE, refresh.refreshToken, {
        ...refreshCookieOptions(),
        maxAge: REFRESH_COOKIE_MAX_AGE,
      });
    }
    return user;
  }
}
