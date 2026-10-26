import * as bcrypt from 'bcrypt';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  UsersService,
  WrongCurrentPasswordException,
} from './users.service.js';

vi.mock('bcrypt', () => ({ hash: vi.fn(), compare: vi.fn() }));

const user = {
  id: 1,
  email: 'owner@example.com',
  nickname: '보호자',
  isDemo: false,
};

describe('UsersService', () => {
  let service: UsersService;
  const findUnique = vi.fn();
  const update = vi.fn();
  const prisma = { user: { findUnique, update } } as unknown as PrismaService;

  beforeEach(() => {
    vi.resetAllMocks();
    findUnique.mockResolvedValue({ passwordHash: 'stored-hash' });
    update.mockResolvedValue(user);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(bcrypt.hash).mockResolvedValue('new-hash' as never);
    service = new UsersService(prisma);
  });

  it('updates the nickname without a preliminary lookup or password changes', async () => {
    const nickname = '새닉네임';
    update.mockResolvedValue({ ...user, nickname });
    await expect(service.update(user.id, { nickname })).resolves.toEqual({
      ...user,
      nickname,
    });
    expect(update).toHaveBeenCalledExactlyOnceWith({
      where: { id: user.id },
      data: { nickname },
      select: { id: true, email: true, nickname: true, isDemo: true },
    });
    expect(findUnique).not.toHaveBeenCalled();
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  it.each([{}, { nickname: '새닉네임' }])(
    'verifies the current password and saves changes together: %j',
    async (changes) => {
      await expect(
        service.update(
          user.id,
          {
            ...changes,
            currentPassword: 'old-password',
            newPassword: 'new-password',
          },
          'new-refresh-hash',
        ),
      ).resolves.toEqual(user);
      expect(findUnique).toHaveBeenCalledExactlyOnceWith({
        where: { id: user.id },
        select: { passwordHash: true },
      });
      expect(bcrypt.compare).toHaveBeenCalledExactlyOnceWith(
        'old-password',
        'stored-hash',
      );
      expect(bcrypt.hash).toHaveBeenCalledExactlyOnceWith('new-password', 10);
      expect(update).toHaveBeenCalledExactlyOnceWith({
        where: { id: user.id, passwordHash: 'stored-hash' },
        data: {
          ...changes,
          passwordHash: 'new-hash',
          refreshTokenHash: 'new-refresh-hash',
        },
        select: { id: true, email: true, nickname: true, isDemo: true },
      });
    },
  );

  it('does not save a new password without a new refresh token', async () => {
    await expect(
      service.update(user.id, {
        currentPassword: 'old-password',
        newPassword: 'new-password',
      }),
    ).rejects.toThrow('A password change needs a new refresh token.');
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { currentPassword: 'old-password' },
    { newPassword: 'new-password' },
    { nickname: '새닉네임', newPassword: 'new-password' },
  ])(
    'rejects incomplete changes before accessing the database: %j',
    async (input) => {
      await expect(service.update(user.id, input)).rejects.toMatchObject({
        status: 400,
      });
      expect(findUnique).not.toHaveBeenCalled();
      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    },
  );

  it('rejects an incorrect current password with 400 and changes neither field', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    const result = service.update(user.id, {
      nickname: '새닉네임',
      currentPassword: 'incorrect',
      newPassword: 'new-password',
    });
    await expect(result).rejects.toBeInstanceOf(WrongCurrentPasswordException);
    await expect(result).rejects.toMatchObject({
      status: 400,
      message: '현재 비밀번호가 맞지 않아요.',
    });
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('does not update a user deleted before password verification', async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      service.update(user.id, {
        currentPassword: 'old-password',
        newPassword: 'new-password',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    { target: ['nickname'] },
    { target: 'users_nickname_key' },
    { driverAdapterError: { cause: { constraint: { fields: ['nickname'] } } } },
    {
      driverAdapterError: {
        cause: { constraint: { index: 'users_nickname_key' } },
      },
    },
  ])('maps nickname unique constraints to 409: %j', async (meta) => {
    update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '7.10.1',
        meta,
      }),
    );
    await expect(
      service.update(user.id, { nickname: '중복닉네임' }),
    ).rejects.toMatchObject({
      status: 409,
      message: '이미 사용 중인 닉네임이에요.',
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('refuses a new password when the password changed after it was checked', async () => {
    update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('record missing', {
        code: 'P2025',
        clientVersion: '7.10.1',
      }),
    );
    const result = service.update(
      user.id,
      { currentPassword: 'old-password', newPassword: 'new-password' },
      'new-refresh-hash',
    );
    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.not.toBeInstanceOf(
      WrongCurrentPasswordException,
    );
    await expect(result).rejects.toMatchObject({
      status: 400,
      message: '현재 비밀번호가 맞지 않아요.',
    });
    expect(update).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        where: { id: user.id, passwordHash: 'stored-hash' },
      }),
    );
  });

  it.each([
    new Error('database unavailable'),
    new Prisma.PrismaClientKnownRequestError('other constraint', {
      code: 'P2002',
      clientVersion: '7.10.1',
      meta: { target: ['email'] },
    }),
    new Prisma.PrismaClientKnownRequestError('record missing', {
      code: 'P2025',
      clientVersion: '7.10.1',
    }),
  ])('preserves unrelated database errors: %s', async (error) => {
    update.mockRejectedValue(error);
    await expect(
      service.update(user.id, { nickname: '새닉네임' }),
    ).rejects.toBe(error);
  });
});
