import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { PublicUser } from '../users/users.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LoginLimiter } from './login-limiter.js';

const credentials = { email: 'owner@example.com', password: 'password123' };
const user = { id: 1, email: credentials.email, nickname: '보호자' };
const request = { ip: '203.0.113.1' } as Request;

describe('AuthController login limiting', () => {
  const validateUser = vi.fn();
  const login = vi.fn();
  const cookie = vi.fn();
  const response = { cookie } as unknown as Response;
  let controller: AuthController;

  beforeEach(() => {
    vi.resetAllMocks();
    login.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      user,
    });
    controller = new AuthController(
      { validateUser, login } as unknown as AuthService,
      new LoginLimiter(),
    );
  });

  it('rejects the sixth concurrent request before password validation and locks after five 401s', async () => {
    const rejectAttempts: Array<(reason: Error) => void> = [];
    validateUser.mockImplementation(
      () =>
        new Promise<PublicUser>((_resolve, reject) =>
          rejectAttempts.push(reject),
        ),
    );
    const attempts = Array.from({ length: 5 }, () =>
      controller.login(credentials, request, response),
    );
    const settled = Promise.allSettled(attempts);
    const sixth = controller.login(credentials, request, response);
    expect(validateUser).toHaveBeenCalledTimes(5);
    await expect(sixth).rejects.toMatchObject({
      status: 429,
      response: {
        message: '로그인 시도가 너무 많아요. 잠시 뒤에 다시 시도해 주세요.',
      },
    });
    for (const reject of rejectAttempts) reject(new UnauthorizedException());
    expect(await settled).toEqual(
      Array.from({ length: 5 }, () => ({
        status: 'rejected',
        reason: expect.objectContaining({ status: 401 }),
      })),
    );
    await expect(
      controller.login(credentials, request, response),
    ).rejects.toMatchObject({ status: 429 });
    expect(validateUser).toHaveBeenCalledTimes(5);
    expect(cookie).not.toHaveBeenCalled();
  });

  it('releases reservations on server errors without counting failures', async () => {
    const error = new Error('database unavailable');
    validateUser.mockRejectedValue(error);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        controller.login(credentials, request, response),
      ).rejects.toBe(error);
    }
    validateUser.mockResolvedValue(user);
    await expect(
      controller.login(credentials, request, response),
    ).resolves.toEqual({ accessToken: 'access', user });
    expect(validateUser).toHaveBeenCalledTimes(6);
    expect(cookie).toHaveBeenCalledTimes(1);
  });

  it('releases successful attempts without erasing prior failures', async () => {
    validateUser.mockRejectedValue(new UnauthorizedException());
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(
        controller.login(credentials, request, response),
      ).rejects.toMatchObject({ status: 401 });
    }
    validateUser.mockResolvedValue(user);
    await controller.login(credentials, request, response);
    validateUser.mockRejectedValue(new UnauthorizedException());
    await expect(
      controller.login(credentials, request, response),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      controller.login(credentials, request, response),
    ).rejects.toMatchObject({ status: 429 });
  });
});
