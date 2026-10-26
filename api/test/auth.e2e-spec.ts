import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app-setup.js';
import { LoginLimiter } from '../src/auth/login-limiter.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const dog = {
  name: ' 보리 ',
  breed: ' 푸들 ',
  size: 'SMALL',
  gender: 'FEMALE',
  neutered: false,
  birthYear: 2020,
  personality: ' 산책을 좋아해요 ',
};
const signup = {
  email: 'owner@example.com',
  password: 'password123',
  nickname: '보리보호자',
  dog,
};
const credentials = { email: signup.email, password: signup.password };

function cookie(response: request.Response): string {
  const cookies = response.headers['set-cookie'] as unknown as string[];
  expect(cookies).toHaveLength(1);
  return cookies[0].split(';')[0];
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const jwt = new JwtService();

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

  it('creates a normalized user and one dog without exposing hashes or issuing tokens', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        ...signup,
        email: ' OWNER@Example.COM ',
        nickname: ' 보리보호자 ',
      })
      .expect(201);
    expect(response.body).toEqual({
      id: expect.any(Number),
      email: signup.email,
      nickname: signup.nickname,
      isDemo: false,
    });
    expect(response.headers['set-cookie']).toBeUndefined();
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: response.body.id },
      include: { dogs: true },
    });
    expect(await bcrypt.compare(signup.password, user.passwordHash)).toBe(true);
    expect(bcrypt.getRounds(user.passwordHash)).toBe(10);
    expect(user.refreshTokenHash).toBeNull();
    expect(user.dogs).toHaveLength(1);
    expect(user.dogs[0]).toMatchObject({
      ...dog,
      name: '보리',
      breed: '푸들',
      personality: '산책을 좋아해요',
      ownerId: user.id,
      photoUrl: null,
    });
  });

  const invalidDogs: [string, unknown][] = [
    ['missing dog', undefined],
    ['null dog', null],
    ['empty array', []],
    ['dog array', [dog]],
    ...Object.keys(dog).map((field): [string, unknown] => [
      `missing ${field}`,
      Object.fromEntries(Object.entries(dog).filter(([key]) => key !== field)),
    ]),
    ['invalid size', { ...dog, size: 'GIANT' }],
    ['invalid gender', { ...dog, gender: 'OTHER' }],
    ['string neutered', { ...dog, neutered: 'false' }],
    ['old birth year', { ...dog, birthYear: 1989 }],
    ['future birth year', { ...dog, birthYear: new Date().getFullYear() + 1 }],
    ['fractional birth year', { ...dog, birthYear: 2020.5 }],
    ['string birth year', { ...dog, birthYear: '2020' }],
    ['blank personality', { ...dog, personality: '   ' }],
    ['long personality', { ...dog, personality: 'a'.repeat(101) }],
    ['photo URL', { ...dog, photoUrl: 'https://example.com/dog.png' }],
    ['blank name', { ...dog, name: ' ' }],
    ['long name', { ...dog, name: 'a'.repeat(21) }],
    ['blank breed', { ...dog, breed: ' ' }],
    ['long breed', { ...dog, breed: 'a'.repeat(31) }],
  ];
  it.each(invalidDogs)(
    'rejects %s without saving either record',
    async (_name, invalidDog) => {
      await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({ ...signup, dog: invalidDog })
        .expect(400);
      expect(await prisma.user.count()).toBe(0);
      expect(await prisma.dog.count()).toBe(0);
    },
  );

  it.each([
    [
      'email',
      { email: 'OWNER@EXAMPLE.COM', nickname: '다른보호자' },
      '이미 가입된 이메일입니다.',
    ],
    [
      'nickname',
      { email: 'other@example.com', nickname: ' 보리보호자 ' },
      '이미 사용 중인 닉네임입니다.',
    ],
  ])(
    'rejects duplicate %s without creating another dog',
    async (_field, changes, message) => {
      await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send(signup)
        .expect(201);
      const response = await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({ ...signup, ...changes })
        .expect(409);
      expect(response.body.message).toBe(message);
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.dog.count()).toBe(1);
    },
  );

  it.each(['email', 'nickname'])(
    'allows only one concurrent signup for the same %s',
    async (field) => {
      const other =
        field === 'email'
          ? { nickname: '다른보호자' }
          : { email: 'other@example.com' };
      const responses = await Promise.all([
        request(app.getHttpServer()).post('/api/auth/signup').send(signup),
        request(app.getHttpServer())
          .post('/api/auth/signup')
          .send({ ...signup, ...other }),
      ]);
      expect(
        responses.map(({ status }) => status).sort((a, b) => a - b),
      ).toEqual([201, 409]);
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.dog.count()).toBe(1);
    },
  );

  it.each([
    { email: 'invalid' },
    { email: `${'a'.repeat(243)}@example.com` },
    { password: 'a'.repeat(7) },
    { password: 'a'.repeat(21) },
    { password: '🐕'.repeat(19) },
    { password: '🐕'.repeat(20) },
    { nickname: 'a' },
    { nickname: 'a'.repeat(21) },
    { extra: true },
  ])('rejects invalid account input %j', async (changes) => {
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...signup, ...changes })
      .expect(400);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.dog.count()).toBe(0);
  });

  it('accepts inclusive dog field boundaries', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        ...signup,
        dog: {
          ...dog,
          name: 'a'.repeat(20),
          breed: 'b'.repeat(30),
          personality: 'c'.repeat(100),
          birthYear: 1990,
        },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        ...signup,
        email: 'second@example.com',
        nickname: '다른보호자',
        dog: { ...dog, birthYear: new Date().getFullYear() },
      })
      .expect(201);
  });

  it('logs in with normalized email and stores only the refresh hash', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send(signup)
      .expect(201);
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ ...credentials, email: ' OWNER@EXAMPLE.COM ' })
      .expect(200);
    expect(response.body).toEqual({
      accessToken: expect.any(String),
      user: {
        id: expect.any(Number),
        email: signup.email,
        nickname: signup.nickname,
        isDemo: false,
      },
    });
    const header = (response.headers['set-cookie'] as unknown as string[])[0];
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Strict');
    expect(header).toContain('Path=/api/auth');
    expect(header).toContain('Max-Age=604800');
    expect(header).not.toContain('Secure');
    const token = cookie(response).slice('refresh_token='.length);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: signup.email },
    });
    expect(user.refreshTokenHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    const accessPayload = jwt.verify(response.body.accessToken, {
      secret: process.env.JWT_ACCESS_SECRET,
    });
    const refreshPayload = jwt.verify(token, {
      secret: process.env.JWT_REFRESH_SECRET,
    });
    expect(accessPayload.exp - accessPayload.iat).toBe(30 * 60);
    expect(refreshPayload.exp - refreshPayload.iat).toBe(7 * 24 * 60 * 60);
    expect(refreshPayload.jti).toEqual(expect.any(String));
  });

  it.each(['form', 'text', 'multipart'])(
    'rejects %s login and signup before authentication or persistence',
    async (type) => {
      await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send(signup)
        .expect(201);
      for (const route of ['login', 'signup']) {
        let req = request(app.getHttpServer()).post(`/api/auth/${route}`);
        if (type === 'form')
          req = req
            .type('form')
            .send(
              route === 'login'
                ? credentials
                : { ...signup, dog: JSON.stringify(dog) },
            );
        else if (type === 'text')
          req = req
            .type('text')
            .send(JSON.stringify(route === 'login' ? credentials : signup));
        else
          req = req
            .field('email', credentials.email)
            .field('password', credentials.password);
        const response = await req.expect(415);
        expect(response.headers['set-cookie']).toBeUndefined();
      }
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.dog.count()).toBe(1);
      expect(
        (await prisma.user.findFirstOrThrow()).refreshTokenHash,
      ).toBeNull();
    },
  );

  it.each(['refresh', 'logout'])(
    'rejects a form %s without changing the cookie',
    async (route) => {
      await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send(signup)
        .expect(201);
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(credentials)
        .expect(200);
      const response = await request(app.getHttpServer())
        .post(`/api/auth/${route}`)
        .set('Cookie', cookie(login))
        .type('form')
        .send({})
        .expect(415);
      expect(response.headers['set-cookie']).toBeUndefined();
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({})
        .set('Cookie', cookie(login))
        .expect(200);
    },
  );

  it('uses the same error for unknown email and incorrect password', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send(signup)
      .expect(201);
    const wrongPassword = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ ...credentials, password: 'incorrect' })
      .expect(401);
    const unknownEmail = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ ...credentials, email: 'unknown@example.com' })
      .expect(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.message).toBe(
      '이메일 또는 비밀번호가 올바르지 않습니다.',
    );
  });

  it('locks after five incorrect passwords without issuing a cookie and isolates other IPs', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send(signup)
      .expect(201);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failure = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', '203.0.113.1')
        .send({ ...credentials, password: 'incorrect' })
        .expect(401);
      expect(failure.headers['set-cookie']).toBeUndefined();
    }
    const locked = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.1')
      .send(credentials)
      .expect(429);
    expect(locked.body).toEqual({
      message: '로그인 시도가 너무 많아요. 잠시 뒤에 다시 시도해 주세요.',
    });
    expect(locked.headers['set-cookie']).toBeUndefined();
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.2')
      .send(credentials)
      .expect(200);
  });

  it('counts unknown emails as failed login attempts', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', '203.0.113.3')
        .send({ ...credentials, email: 'unknown@example.com' })
        .expect(401);
    }
    const locked = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.3')
      .send(credentials)
      .expect(429);
    expect(locked.headers['set-cookie']).toBeUndefined();
  });

  it('counts the rightmost forwarded address even when the client spoofs earlier addresses', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', `198.51.100.${attempt + 1}, 203.0.113.9`)
        .send(credentials)
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', '198.51.100.99, 203.0.113.9')
      .send(credentials)
      .expect(429);
  });

  it.each(['empty email', 'non-JSON body'])(
    'does not count requests rejected for %s before the controller',
    async (kind) => {
      await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send(signup)
        .expect(201);
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const login = request(app.getHttpServer())
          .post('/api/auth/login')
          .set('X-Forwarded-For', '203.0.113.4');
        if (kind === 'empty email') {
          await login.send({ ...credentials, email: '' }).expect(400);
          continue;
        }
        await login.type('form').send(credentials).expect(415);
      }
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', '203.0.113.4')
        .send(credentials)
        .expect(200);
    },
  );

  it.each([
    { password: 123 },
    { email: 123 },
    { email: undefined },
    { password: undefined },
    { password: null },
    { extra: true },
  ])('rejects invalid login input %j', async (changes) => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ ...credentials, ...changes })
      .expect(400);
  });

  it.each([
    { email: '', password: '' },
    { email: signup.email, password: '' },
    { email: '   ', password: signup.password },
  ])(
    'rejects empty body credentials even when the query has them %j',
    async (body) => {
      await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send(signup)
        .expect(201);
      const query = new URLSearchParams(credentials).toString();
      const response = await request(app.getHttpServer())
        .post(`/api/auth/login?${query}`)
        .send(body)
        .expect(400);
      expect(response.headers['set-cookie']).toBeUndefined();
    },
  );

  it('accepts 72-byte passwords and rejects a 73-byte login before bcrypt truncates it', async () => {
    const password = '🐕'.repeat(18);
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...signup, password })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ ...credentials, password })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ ...credentials, password: `${password}a` })
      .expect(400);
  });

  it('protects /users/me while leaving health public', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send(signup)
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send(credentials)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/users/me')
      .auth(login.body.accessToken, { type: 'bearer' })
      .expect(200, login.body.user);
    await request(app.getHttpServer()).get('/api/users/me').expect(401);
    const expired = jwt.sign(
      { sub: login.body.user.id },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: -1 },
    );
    await request(app.getHttpServer())
      .get('/api/users/me')
      .auth(expired, { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/users/me')
      .auth(`${login.body.accessToken}x`, { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer()).get('/api/health').expect(200);
  });

  it('issues an access token without changing the cookie and allows repeated refresh', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send(signup)
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send(credentials)
      .expect(200);
    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({})
      .set('Cookie', cookie(login))
      .expect(200);
    expect(refreshed.headers['set-cookie']).toBeUndefined();
    expect(refreshed.body).toEqual({
      accessToken: expect.any(String),
      user: login.body.user,
    });
    await request(app.getHttpServer())
      .get('/api/users/me')
      .auth(refreshed.body.accessToken, { type: 'bearer' })
      .expect(200, login.body.user);
    const repeated = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({})
      .set('Cookie', cookie(login))
      .expect(200);
    expect(repeated.headers['set-cookie']).toBeUndefined();
    expect(repeated.body).toEqual({
      accessToken: expect.any(String),
      user: login.body.user,
    });
    expect((await prisma.user.findFirstOrThrow()).refreshTokenHash).toBe(
      createHash('sha256')
        .update(cookie(login).slice('refresh_token='.length))
        .digest('hex'),
    );
  });

  it.each(['missing', 'malformed', 'expired', 'wrong signature'])(
    'rejects %s refresh cookies',
    async (kind) => {
      const token =
        kind === 'expired'
          ? jwt.sign(
              { sub: 1 },
              {
                secret: process.env.JWT_REFRESH_SECRET,
                expiresIn: -1,
                jwtid: 'expired',
              },
            )
          : kind === 'wrong signature'
            ? jwt.sign(
                { sub: 1 },
                { secret: 'test-only-wrong-secret', jwtid: 'invalid' },
              )
            : 'invalid';
      const req = request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({});
      if (kind !== 'missing') req.set('Cookie', `refresh_token=${token}`);
      const response = await req.expect(401);
      expect(response.headers['set-cookie']).toBeUndefined();
    },
  );

  it('allows both concurrent refresh requests for the same cookie', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send(signup)
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send(credentials)
      .expect(200);
    const responses = await Promise.all(
      [0, 1].map(() =>
        request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({})
          .set('Cookie', cookie(login)),
      ),
    );
    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    for (const response of responses) {
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.body).toEqual({
        accessToken: expect.any(String),
        user: login.body.user,
      });
    }
  });

  it('logs out without an access token and invalidates the matching refresh token', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send(signup)
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send(credentials)
      .expect(200);
    const response = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .send({})
      .set('Cookie', cookie(login))
      .expect(204);
    expect(cookie(response)).toBe('refresh_token=');
    expect((await prisma.user.findFirstOrThrow()).refreshTokenHash).toBeNull();
    const rejected = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({})
      .set('Cookie', cookie(login))
      .expect(401);
    expect(rejected.headers['set-cookie']).toBeUndefined();
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .send({})
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .send({})
      .set('Cookie', 'refresh_token=invalid')
      .expect(204);
  });

  it('does not let device A logout invalidate device B', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send(signup)
      .expect(201);
    const deviceA = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send(credentials)
      .expect(200);
    const deviceB = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send(credentials)
      .expect(200);
    expect(cookie(deviceA)).not.toBe(cookie(deviceB));
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .send({})
      .set('Cookie', cookie(deviceA))
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({})
      .set('Cookie', cookie(deviceB))
      .expect(200);
    const rejected = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({})
      .set('Cookie', cookie(deviceA))
      .expect(401);
    expect(rejected.headers['set-cookie']).toBeUndefined();
  });
});
