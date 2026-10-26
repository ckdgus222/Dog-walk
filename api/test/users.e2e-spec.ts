import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app-setup.js';
import { LoginLimiter } from '../src/auth/login-limiter.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { PublicUser } from '../src/users/users.service.js';

const dog = {
  name: '보리',
  breed: '푸들',
  size: 'SMALL',
  gender: 'FEMALE',
  neutered: false,
  birthYear: 2020,
  personality: '산책을 좋아해요',
};
const password = 'password123';
const newPassword = 'new-password';
type Account = { user: PublicUser; authorization: string; cookie: string };

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    app.get(LoginLimiter).clear();
    await prisma.comment.deleteMany();
    await prisma.post.deleteMany();
    await prisma.diaryImage.deleteMany();
    await prisma.diary.deleteMany();
    await prisma.chatMessage.deleteMany();
    await prisma.walkRequest.deleteMany();
    await prisma.dog.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app?.close();
  });

  async function signup(
    nickname = '보호자',
    initialPassword = password,
  ): Promise<Account> {
    const email = `${nickname}@example.com`;
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ email, nickname, password: initialPassword, dog })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: initialPassword })
      .expect(200);
    return {
      user: login.body.user,
      authorization: `Bearer ${login.body.accessToken}`,
      cookie: refreshCookie(login),
    };
  }

  function refreshCookie(response: request.Response) {
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies).toHaveLength(1);
    return cookies[0].split(';')[0];
  }

  function refresh(cookie: string) {
    return request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .send({});
  }

  function update(account: Account, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch('/api/users/me')
      .set('Authorization', account.authorization)
      .send(body);
  }

  it('requires login before making any changes', async () => {
    const account = await signup();
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: account.user.id },
    });
    await request(app.getHttpServer())
      .patch('/api/users/me')
      .send({ nickname: '새닉네임' })
      .expect(401);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: account.user.id } }),
    ).toEqual(before);
  });

  it('trims nicknames, accepts the same nickname, and returns only public fields', async () => {
    const account = await signup();
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: account.user.id },
    });
    // The second pass sends the nickname the account already has.
    for (const nickname of ['새닉네임', '새닉네임']) {
      const response = await update(account, {
        nickname: ` ${nickname} `,
      }).expect(200);
      expect(response.body).toEqual({ ...account.user, nickname });
      const me = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', account.authorization)
        .expect(200);
      expect(me.body).toEqual(response.body);
      expect(
        await prisma.user.findUniqueOrThrow({ where: { id: account.user.id } }),
      ).toMatchObject({
        nickname,
        passwordHash: before.passwordHash,
        refreshTokenHash: before.refreshTokenHash,
      });
    }
  });

  it('returns 409 for duplicate nicknames without changing either field', async () => {
    const account = await signup();
    const other = await signup('다른보호자');
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: account.user.id },
    });
    const response = await update(account, {
      nickname: other.user.nickname,
      currentPassword: password,
      newPassword,
    }).expect(409);
    expect(response.body.message).toBe('이미 사용 중인 닉네임이에요.');
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: account.user.id } }),
    ).toEqual(before);
  });

  it('allows only one of two users to claim the same nickname concurrently', async () => {
    const first = await signup();
    const second = await signup('다른보호자');
    const responses = await Promise.all([
      update(first, { nickname: '같은닉네임' }),
      update(second, { nickname: '같은닉네임' }),
    ]);
    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([200, 409]);
    expect(
      responses.find((response) => response.status === 409)?.body.message,
    ).toBe('이미 사용 중인 닉네임이에요.');
    expect(await prisma.user.count({ where: { nickname: '같은닉네임' } })).toBe(
      1,
    );
  });

  it('returns 400 for an incorrect current password and preserves both fields and login', async () => {
    const account = await signup();
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: account.user.id },
    });
    const response = await update(account, {
      nickname: '새닉네임',
      currentPassword: 'incorrect',
      newPassword,
    }).expect(400);
    expect(response.body.message).toBe('현재 비밀번호가 맞지 않아요.');
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: account.user.id } }),
    ).toEqual(before);
    await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', account.authorization)
      .expect(200, account.user);
  });

  it('blocks password changes after five wrong passwords while preserving login and nickname changes', async () => {
    const account = await signup();
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: account.user.id },
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wrong = await update(account, {
        currentPassword: 'incorrect',
        newPassword,
      }).expect(400);
      expect(wrong.body.message).toBe('현재 비밀번호가 맞지 않아요.');
      expect(wrong.headers['set-cookie']).toBeUndefined();
    }
    const blocked = await update(account, {
      currentPassword: password,
      newPassword,
    }).expect(429);
    expect(blocked.body).toEqual({
      message:
        '비밀번호 확인 시도가 너무 많아요. 잠시 뒤에 다시 시도해 주세요.',
    });
    expect(blocked.headers['set-cookie']).toBeUndefined();
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: account.user.id } }),
    ).toEqual(before);
    await refresh(account.cookie).expect(200);

    const renamed = await update(account, { nickname: '새닉네임' }).expect(200);
    expect(renamed.body).toEqual({ ...account.user, nickname: '새닉네임' });
    expect(renamed.headers['set-cookie']).toBeUndefined();
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: account.user.id } }),
    ).toMatchObject({
      passwordHash: before.passwordHash,
      refreshTokenHash: before.refreshTokenHash,
    });
    // Login itself replaces the refresh hash, so check the old hash first.
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: account.user.email, password })
      .expect(200);
  });

  it('rejects a suffix after a correct 72-byte password without saving, then accepts the exact password', async () => {
    const currentPassword = '🐕'.repeat(18);
    const account = await signup('보호자', currentPassword);
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: account.user.id },
    });
    await update(account, {
      nickname: '새닉네임',
      currentPassword: currentPassword + 'a',
      newPassword,
    }).expect(400);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: account.user.id } }),
    ).toEqual(before);
    const response = await update(account, {
      currentPassword,
      newPassword,
    }).expect(200);
    expect(response.body).toEqual(account.user);
    const changed = await prisma.user.findUniqueOrThrow({
      where: { id: account.user.id },
    });
    expect(await bcrypt.compare(newPassword, changed.passwordHash)).toBe(true);
    expect(await bcrypt.compare(currentPassword, changed.passwordHash)).toBe(
      false,
    );
  });

  it('changes both fields, hashes at cost 10, and only allows login with the new password', async () => {
    const account = await signup();
    const response = await update(account, {
      nickname: '새닉네임',
      currentPassword: password,
      newPassword,
    }).expect(200);
    expect(response.body).toEqual({ ...account.user, nickname: '새닉네임' });
    const changed = await prisma.user.findUniqueOrThrow({
      where: { id: account.user.id },
    });
    expect(bcrypt.getRounds(changed.passwordHash)).toBe(10);
    expect(await bcrypt.compare(newPassword, changed.passwordHash)).toBe(true);
    // AuthController/AuthService have no IP-based failed-login blocking.
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: account.user.email, password })
      .expect(401);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: account.user.email, password: newPassword })
      .expect(200);
    expect(login.body.user).toEqual(response.body);
  });

  it('ends refresh tokens from before a password change and keeps this browser logged in', async () => {
    const account = await signup();
    // A nickname change keeps the refresh token.
    const renamed = await update(account, { nickname: '새닉네임' }).expect(200);
    expect(renamed.headers['set-cookie']).toBeUndefined();
    await refresh(account.cookie).expect(200);

    const changed = await update(account, {
      currentPassword: password,
      newPassword,
    }).expect(200);
    const newCookie = refreshCookie(changed);
    expect(changed.headers['set-cookie'][0]).toMatch(/Path=\/api\/auth/);
    expect(changed.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    await refresh(account.cookie).expect(401);
    const refreshed = await refresh(newCookie).expect(200);
    expect(refreshed.body.user).toEqual({
      ...account.user,
      nickname: '새닉네임',
    });
  });

  it('keeps the refresh token when the current password is wrong', async () => {
    const account = await signup();
    const wrong = await update(account, {
      currentPassword: 'not-the-password',
      newPassword,
    }).expect(400);
    expect(wrong.headers['set-cookie']).toBeUndefined();
    await refresh(account.cookie).expect(200);
  });

  it('rejects incomplete, invalid and unknown fields and non-JSON requests without saving', async () => {
    const account = await signup();
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: account.user.id },
    });
    // Every field rule is tested in update-user.dto.spec.ts; these check
    // that the app's pipe and the service's own rules reach this route.
    for (const body of [
      {},
      { currentPassword: password },
      { newPassword },
      { nickname: '가' },
      { currentPassword: password, newPassword: 'a'.repeat(7) },
      { nickname: '새닉네임', email: 'other@example.com' },
    ]) {
      await update(account, body).expect(400);
    }
    await request(app.getHttpServer())
      .patch('/api/users/me')
      .set('Authorization', account.authorization)
      .type('form')
      .send({ nickname: '새닉네임' })
      .expect(415);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: account.user.id } }),
    ).toEqual(before);
  });
});
