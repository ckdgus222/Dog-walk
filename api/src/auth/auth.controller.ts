import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import type { PublicUser } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { SignupDto } from './dto/signup.dto.js';
import { JsonBodyGuard } from './json-body.guard.js';
import { LocalAuthGuard } from './local-auth.guard.js';

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

  // JSON-only stops cross-site HTML forms from triggering cookie-clearing responses.
  @Post('refresh')
  @HttpCode(200)
  @UseGuards(JsonBodyGuard)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookie: unknown = request.cookies?.refresh_token;
    try {
      const { accessToken, refreshToken, user } = await this.auth.refresh(
        typeof cookie === 'string' ? cookie : undefined,
      );
      response.cookie('refresh_token', refreshToken, {
        ...this.cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      return { accessToken, user };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        response.clearCookie('refresh_token', this.cookieOptions);
      }
      throw error;
    }
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
