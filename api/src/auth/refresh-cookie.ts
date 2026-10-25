import type { CookieOptions } from 'express';

// The refresh token cookie, sent only to the auth routes. Login and a
// password change set it; logout clears it.
export const REFRESH_COOKIE = 'refresh_token';

export const refreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'strict',
  path: '/api/auth',
  secure: process.env.COOKIE_SECURE === 'true',
});

export const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
