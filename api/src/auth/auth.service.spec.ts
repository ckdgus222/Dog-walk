import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import type { SignupDto } from './dto/signup.dto.js';

vi.mock('bcrypt', () => ({ hash: vi.fn(), compare: vi.fn() }));

const user = { id: 1, email: 'owner@example.com', nickname: '보호자' };
const input: SignupDto = {
  ...user,
  password: 'password123',
  dog: {
    name: '보리',
    breed: '푸들',
    size: 'SMALL',
    gender: 'FEMALE',
    neutered: false,
    birthYear: 2020,
    personality: '얌전해요',
  },
};

describe('AuthService', () => {
  let service: AuthService;
  const jwt = new JwtService();
  const create = vi.fn();
  const update = vi.fn();
  const updateMany = vi.fn();
  const execute = vi.fn();
  const findUnique = vi.fn();
  const findByEmail = vi.fn();
  const prisma = {
    $executeRaw: execute,
    user: { create, update, updateMany, findUnique },
  } as unknown as PrismaService;
  const users = { findByEmail } as unknown as UsersService;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(bcrypt.hash).mockResolvedValue('hashed-password' as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    findUnique.mockResolvedValue(user);
    updateMany.mockResolvedValue({ count: 1 });
    service = new AuthService(prisma, users, jwt);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'])(
    'requires %s at startup',
    (name) => {
      vi.stubEnv(name, '');
      expect(() => new AuthService(prisma, users, jwt)).toThrow('are required');
    },
  );

  it('creates the user and dog together and selects only public fields', async () => {
    create.mockResolvedValue(user);
    await expect(service.signup(input)).resolves.toEqual(user);
    expect(bcrypt.hash).toHaveBeenCalledWith(input.password, 10);
    expect(create).toHaveBeenCalledExactlyOnceWith({
      data: {
        email: user.email,
        nickname: user.nickname,
        passwordHash: 'hashed-password',
        dogs: { create: input.dog },
      },
      select: { id: true, email: true, nickname: true },
    });
  });

  it.each([
    ['email', '이미 가입된 이메일입니다.'],
    ['nickname', '이미 사용 중인 닉네임입니다.'],
  ])('maps the %s unique violation', async (field, message) => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '7.10.1',
        meta: { target: [field] },
      }),
    );
    await expect(service.signup(input)).rejects.toMatchObject({
      status: 409,
      message,
    });
  });

  it.each([
    ['email', '이미 가입된 이메일입니다.'],
    ['nickname', '이미 사용 중인 닉네임입니다.'],
  ])('maps Prisma 7 adapter constraints for %s', async (field, message) => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '7.10.1',
        meta: {
          driverAdapterError: {
            cause: {
              kind: 'UniqueConstraintViolation',
              constraint: { index: `users_${field}_key` },
            },
          },
        },
      }),
    );
    await expect(service.signup(input)).rejects.toMatchObject({
      status: 409,
      message,
    });
  });

  it('preserves unexpected database errors', async () => {
    const error = new Error('database unavailable');
    create.mockRejectedValue(error);
    await expect(service.signup(input)).rejects.toBe(error);
  });

  it('compares a fixed cost-10 hash even when the email does not exist', async () => {
    findByEmail.mockResolvedValue(null);
    await expect(
      service.validateUser(user.email, 'incorrect'),
    ).rejects.toMatchObject({
      status: 401,
      message: '이메일 또는 비밀번호가 올바르지 않습니다.',
    });
    expect(bcrypt.compare).toHaveBeenCalledExactlyOnceWith(
      'incorrect',
      expect.stringMatching(/^\$2b\$10\$/),
    );
  });

  it('rejects incorrect passwords using the same message', async () => {
    findByEmail.mockResolvedValue({ ...user, passwordHash: 'stored-hash' });
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    await expect(
      service.validateUser(user.email, 'incorrect'),
    ).rejects.toMatchObject({
      status: 401,
      message: '이메일 또는 비밀번호가 올바르지 않습니다.',
    });
  });

  it('removes private fields from the authenticated user', async () => {
    findByEmail.mockResolvedValue({
      ...user,
      passwordHash: 'stored-hash',
      refreshTokenHash: 'private-hash',
    });
    await expect(
      service.validateUser(user.email, input.password),
    ).resolves.toEqual(user);
  });

  it('issues different refresh tokens even within one second and stores their hashes', async () => {
    const first = await service.login(user);
    const second = await service.login(user);
    expect(first.refreshToken).not.toBe(second.refreshToken);
    expect(update).toHaveBeenLastCalledWith({
      where: { id: user.id },
      data: {
        refreshTokenHash: createHash('sha256')
          .update(second.refreshToken)
          .digest('hex'),
      },
    });
    const access = jwt.verify(second.accessToken, {
      secret: process.env.JWT_ACCESS_SECRET,
    });
    const refresh = jwt.verify(second.refreshToken, {
      secret: process.env.JWT_REFRESH_SECRET,
    });
    expect(access.exp - access.iat).toBe(1800);
    expect(refresh.exp - refresh.iat).toBe(604800);
    expect(refresh.jti).toEqual(expect.any(String));
  });

  it('checks the stored hash and only issues an access token without changing it', async () => {
    const login = await service.login(user);
    update.mockClear();
    const refreshed = await service.refresh(login.refreshToken);
    expect(refreshed).toEqual({ accessToken: expect.any(String), user });
    const access = jwt.verify(refreshed.accessToken, {
      secret: process.env.JWT_ACCESS_SECRET,
    });
    expect(access.sub).toBe(user.id);
    expect(access.exp - access.iat).toBe(1800);
    expect(findUnique).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: user.id,
        refreshTokenHash: createHash('sha256')
          .update(login.refreshToken)
          .digest('hex'),
      },
      select: { id: true, email: true, nickname: true },
    });
    await expect(service.refresh(login.refreshToken)).resolves.toEqual({
      accessToken: expect.any(String),
      user,
    });
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects a refresh whose hash no longer matches', async () => {
    const login = await service.login(user);
    findUnique.mockResolvedValue(null);
    await expect(service.refresh(login.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each([undefined, 'invalid'])(
    'rejects missing or malformed refresh tokens',
    async (token) => {
      await expect(service.refresh(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it('rejects expired refresh tokens before querying the database', async () => {
    const token = jwt.sign(
      { sub: user.id },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: -1,
        jwtid: 'expired',
      },
    );
    await expect(service.refresh(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('verifies an access token and looks up the current user', async () => {
    const { accessToken } = await service.login(user);
    await expect(service.verifyAccessToken(accessToken)).resolves.toEqual({
      user,
      exp: expect.any(Number),
    });
    expect(findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { id: user.id },
      select: { id: true, email: true, nickname: true },
    });
  });

  it.each([
    { sub: '1', exp: Math.floor(Date.now() / 1000) + 60 },
    { sub: 0, exp: Math.floor(Date.now() / 1000) + 60 },
    { sub: -1, exp: Math.floor(Date.now() / 1000) + 60 },
    { sub: 1.5, exp: Math.floor(Date.now() / 1000) + 60 },
    {
      sub: Number.MAX_SAFE_INTEGER + 1,
      exp: Math.floor(Date.now() / 1000) + 60,
    },
    { sub: 1 },
    { sub: 1, exp: Math.floor(Date.now() / 1000) - 1 },
  ])(
    'rejects invalid socket access claims before querying users: %j',
    async (payload) => {
      const token = jwt.sign(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        algorithm: 'HS256',
      });
      await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed, refresh, and wrong-algorithm tokens', async () => {
    const { refreshToken } = await service.login(user);
    const wrongAlgorithm = jwt.sign(
      { sub: user.id },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        algorithm: 'HS384',
        expiresIn: '1m',
      },
    );
    for (const token of ['invalid', refreshToken, wrongAlgorithm]) {
      await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects an access token for a deleted user', async () => {
    const { accessToken } = await service.login(user);
    findUnique.mockResolvedValue(null);
    await expect(service.verifyAccessToken(accessToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('clears the matching cookie hash and location in one parameterized update', async () => {
    await service.logout('old-device-token');
    expect(execute).toHaveBeenCalledTimes(1);
    const [query, ...values] = execute.mock.calls[0];
    expect(query.join('?').replace(/\s+/g, ' ').trim()).toBe(
      'UPDATE users SET refresh_token_hash = NULL, location = NULL, location_consented_at = NULL, location_updated_at = NULL WHERE refresh_token_hash = ?',
    );
    expect(values).toEqual([
      createHash('sha256').update('old-device-token').digest('hex'),
    ]);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('accepts logout with no cookie without touching the database', async () => {
    await service.logout(undefined);
    expect(execute).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
