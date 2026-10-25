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
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { SignupDto } from './dto/signup.dto.js';
import { JsonBodyGuard } from './guards/json-body.guard.js';
import {
  REFRESH_COOKIE,
  REFRESH_COOKIE_MAX_AGE,
  refreshCookieOptions,
} from './refresh-cookie.js';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('signup')
  @UseGuards(JsonBodyGuard)
  signup(@Body() input: SignupDto) {
    return this.auth.signup(input);
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(JsonBodyGuard)
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const verified = await this.auth.validateUser(input.email, input.password);
    const { accessToken, refreshToken, user } = await this.auth.login(
      verified.user,
      verified.passwordHash,
    );
    response.cookie(REFRESH_COOKIE, refreshToken, {
      ...refreshCookieOptions(),
      maxAge: REFRESH_COOKIE_MAX_AGE,
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
      response.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
    }
  }
}
