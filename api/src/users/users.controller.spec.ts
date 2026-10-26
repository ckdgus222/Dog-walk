import { BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { LoginLimiter } from '../auth/login-limiter.js';
import { UsersController } from './users.controller.js';
import {
  UsersService,
  WrongCurrentPasswordException,
  type PublicUser,
} from './users.service.js';

const user = {
  id: 1,
  email: 'owner@example.com',
  nickname: '보호자',
  isDemo: false,
};
const request = { user } as Request & { user: PublicUser };
const changes = {
  currentPassword: 'old-password',
  newPassword: 'new-password',
};
const refresh = { refreshToken: 'refresh', refreshTokenHash: 'refresh-hash' };

describe('UsersController password limiting', () => {
  const update = vi.fn();
  const newRefreshToken = vi.fn();
  const cookie = vi.fn();
  const response = { cookie } as unknown as Response;
  let controller: UsersController;
  let limiter: LoginLimiter;

  beforeEach(() => {
    vi.resetAllMocks();
    update.mockResolvedValue(user);
    newRefreshToken.mockResolvedValue(refresh);
    limiter = new LoginLimiter();
    controller = new UsersController(
      { update } as unknown as UsersService,
      { newRefreshToken } as unknown as AuthService,
      limiter,
    );
  });

  it('rejects the sixth concurrent change before issuing a token or checking the password', async () => {
    const rejectAttempts: Array<(reason: Error) => void> = [];
    update.mockImplementation(
      () =>
        new Promise<PublicUser>((_resolve, reject) =>
          rejectAttempts.push(reject),
        ),
    );
    const attempts = Array.from({ length: 5 }, () =>
      controller.update(request, changes, response),
    );
    const settled = Promise.allSettled(attempts);
    await expect(
      controller.update(request, changes, response),
    ).rejects.toMatchObject({
      status: 429,
      response: {
        message:
          '비밀번호 확인 시도가 너무 많아요. 잠시 뒤에 다시 시도해 주세요.',
      },
    });
    expect(newRefreshToken).toHaveBeenCalledTimes(5);
    expect(update).toHaveBeenCalledTimes(5);
    for (const reject of rejectAttempts)
      reject(new WrongCurrentPasswordException());
    expect(await settled).toEqual(
      Array.from({ length: 5 }, () => ({
        status: 'rejected',
        reason: expect.any(WrongCurrentPasswordException),
      })),
    );
    expect(cookie).not.toHaveBeenCalled();
  });

  it('blocks a correct password after five wrong passwords but allows nicknames and other accounts', async () => {
    update.mockRejectedValue(new WrongCurrentPasswordException());
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        controller.update(request, changes, response),
      ).rejects.toBeInstanceOf(WrongCurrentPasswordException);
    }
    update.mockResolvedValue(user);
    await expect(
      controller.update(request, changes, response),
    ).rejects.toMatchObject({
      status: 429,
    });
    expect(update).toHaveBeenCalledTimes(5);
    expect(newRefreshToken).toHaveBeenCalledTimes(5);
    expect(cookie).not.toHaveBeenCalled();

    await expect(
      controller.update(request, { nickname: '새닉네임' }, response),
    ).resolves.toEqual(user);
    expect(update).toHaveBeenLastCalledWith(user.id, { nickname: '새닉네임' });
    expect(newRefreshToken).toHaveBeenCalledTimes(5);
    expect(cookie).not.toHaveBeenCalled();

    const other = { user: { ...user, id: 2 } } as typeof request;
    await expect(controller.update(other, changes, response)).resolves.toEqual(
      user,
    );
    expect(update).toHaveBeenLastCalledWith(
      2,
      changes,
      refresh.refreshTokenHash,
    );
    expect(newRefreshToken).toHaveBeenLastCalledWith(2);
    expect(cookie).toHaveBeenCalledTimes(1);
    expect(limiter.begin('203.0.113.1')).toBe(true);
  });

  it.each([
    new BadRequestException('현재 비밀번호가 맞지 않아요.'),
    new Error('database unavailable'),
  ])('releases service errors without counting failures: %s', async (error) => {
    update.mockRejectedValue(error);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(controller.update(request, changes, response)).rejects.toBe(
        error,
      );
    }
    update.mockResolvedValue(user);
    await expect(
      controller.update(request, changes, response),
    ).resolves.toEqual(user);
    expect(update).toHaveBeenCalledTimes(6);
    expect(cookie).toHaveBeenCalledTimes(1);
  });

  it('releases token issuance errors before the service is called', async () => {
    const error = new Error('token issuance failed');
    newRefreshToken.mockRejectedValue(error);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(controller.update(request, changes, response)).rejects.toBe(
        error,
      );
    }
    expect(update).not.toHaveBeenCalled();
    newRefreshToken.mockResolvedValue(refresh);
    await expect(
      controller.update(request, changes, response),
    ).resolves.toEqual(user);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('releases successful changes without clearing earlier failures', async () => {
    update.mockRejectedValue(new WrongCurrentPasswordException());
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(
        controller.update(request, changes, response),
      ).rejects.toBeInstanceOf(WrongCurrentPasswordException);
    }
    update.mockResolvedValue(user);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await expect(
        controller.update(request, changes, response),
      ).resolves.toEqual(user);
    }
    update.mockRejectedValue(new WrongCurrentPasswordException());
    await expect(
      controller.update(request, changes, response),
    ).rejects.toBeInstanceOf(WrongCurrentPasswordException);
    await expect(
      controller.update(request, changes, response),
    ).rejects.toMatchObject({
      status: 429,
    });
    expect(update).toHaveBeenCalledTimes(11);
  });
});
