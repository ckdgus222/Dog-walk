import {
  type ExecutionContext,
  BadRequestException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JsonBodyGuard } from './json-body.guard.js';
import { LocalAuthGuard } from './local-auth.guard.js';

describe('Auth guards', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain',
    undefined,
  ])('rejects %s before authentication', (contentType) => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ is: (type: string) => type === contentType }),
      }),
    } as unknown as ExecutionContext;
    expect(() => new JsonBodyGuard().canActivate(context)).toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('accepts JSON', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          is: (type: string) => type === 'application/json',
        }),
      }),
    } as unknown as ExecutionContext;
    expect(new JsonBodyGuard().canActivate(context)).toBe(true);
  });

  it.each([
    { password: 123 },
    { password: '🐕'.repeat(18) + 'a' },
    { extra: true },
    { email: undefined },
  ])('validates login input before invoking Passport %#', async (changes) => {
    const passport = vi
      .spyOn(AuthGuard('local').prototype, 'canActivate')
      .mockResolvedValue(true);
    const request = {
      body: { email: 'owner@example.com', password: 'password123', ...changes },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    await expect(
      new LocalAuthGuard().canActivate(context),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(passport).not.toHaveBeenCalled();
  });

  it('uses the same login error when Passport rejects empty credentials', () => {
    expect(() => new LocalAuthGuard().handleRequest(undefined, false)).toThrow(
      '이메일 또는 비밀번호가 올바르지 않습니다.',
    );
  });

  it('passes the normalized email to Passport', async () => {
    const passport = vi
      .spyOn(AuthGuard('local').prototype, 'canActivate')
      .mockResolvedValue(true);
    const request = {
      body: { email: ' OWNER@EXAMPLE.COM ', password: ' password ' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    await expect(new LocalAuthGuard().canActivate(context)).resolves.toBe(true);
    expect(request.body).toEqual({
      email: 'owner@example.com',
      password: ' password ',
    });
    expect(passport).toHaveBeenCalledExactlyOnceWith(context);
  });
});
