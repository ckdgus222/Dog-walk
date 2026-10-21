import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import type { PublicUser } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { SignupDto } from './dto/signup.dto.js';
import { JsonBodyGuard } from './guards/json-body.guard.js';
import { LocalAuthGuard } from './guards/local-auth.guard.js';

@Controller('auth')
export class AuthController {
  private readonly cookieOptions: CookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    path: '/api/auth',
    secure: process.env.COOKIE_SECURE === 'true',
  };

  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('signup')
  @UseGuards(JsonBodyGuard)
  signup(@Body() input: SignupDto) {
    return this.auth.signup(input);
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(JsonBodyGuard, LocalAuthGuard)
  async login(
    @Req() request: Request & { user: PublicUser },
    @Res({ passthrough: true }) response: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.auth.login(
      request.user,
    );
    response.cookie('refresh_token', refreshToken, {
      ...this.cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { accessToken, user };
  }

  // Refresh failures leave the cookie alone: a late 401 must not clear a cookie
  // that another tab has just replaced by logging in. Only logout clears it.
  @Post('refresh')
  @HttpCode(200)
  @UseGuards(JsonBodyGuard)
  refresh(@Req() request: Request) {
    const cookie: unknown = request.cookies?.refresh_token;
    return this.auth.refresh(typeof cookie === 'string' ? cookie : undefined);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(JsonBodyGuard)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookie: unknown = request.cookies?.refresh_token;
    try {
      await this.auth.logout(typeof cookie === 'string' ? cookie : undefined);
    } finally {
      response.clearCookie('refresh_token', this.cookieOptions);
    }
  }
}
