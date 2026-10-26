import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { mkdir, readdir, rm } from 'node:fs/promises';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import sharp from 'sharp';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app-setup.js';
import { LoginLimiter } from '../src/auth/login-limiter.js';
import { DEMO_EMAIL } from '../src/demo/demo.constants.js';
import { resetDemo } from '../src/demo/reset-demo.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const dog = {
  name: '산책친구',
  breed: '믹스',
  size: 'SMALL',
  gender: 'FEMALE',
  neutered: true,
  birthYear: 2021,
  personality: '차분해요',
};
const diary = {
  title: '공원 산책',
  walkedOn: '2020-10-20',
  content: '함께 걸었어요.',
};
const forbiddenMessage = '데모 계정에서는 할 수 없어요.';
const publicDirectory = process.env.PUBLIC_UPLOAD_DIR!;
const privateDirectory = process.env.PRIVATE_UPLOAD_DIR!;

function cookie(response: request.Response): string {
  const cookies = response.headers['set-cookie'] as unknown as string[];
  expect(cookies).toHaveLength(1);
  return cookies[0].split(';')[0];
}

describe('Demo authentication and limits (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jpeg: Buffer;
  const jwt = new JwtService();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    jpeg = await sharp({
      create: { width: 10, height: 10, channels: 3, background: 'orange' },
    })
      .jpeg()
      .toBuffer();
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
    await rm(publicDirectory, { recursive: true, force: true });
    await rm(privateDirectory, { recursive: true, force: true });
    await mkdir(publicDirectory, { recursive: true });
    await mkdir(privateDirectory, { recursive: true });
    await resetDemo(prisma);
  });

  afterAll(async () => {
    await app?.close();
    await rm(publicDirectory, { recursive: true, force: true });
    await rm(privateDirectory, { recursive: true, force: true });
  });

  function login() {
    return request(app.getHttpServer())
      .post('/api/auth/demo')
      .send({})
      .expect(200);
  }

  function refresh(refreshCookie: string) {
    return request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .send({});
  }

  async function realUser(suffix = 'real') {
    const account = {
      email: `${suffix}@example.com`,
      password: 'password123',
      nickname: suffix,
    };
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...account, dog })
      .expect(201);
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: account.email, password: account.password })
      .expect(200);
    const authorization = `Bearer ${response.body.accessToken}`;
    await request(app.getHttpServer())
      .post('/api/users/me/location-consent')
      .set('Authorization', authorization)
      .expect(204);
    await request(app.getHttpServer())
      .patch('/api/users/me/location')
      .set('Authorization', authorization)
      .send({ lat: 37.528, lng: 126.932 })
      .expect(200);
    return { id: response.body.user.id as number, authorization };
  }

  it('issues a two-hour cookie without changing the demo account', async () => {
    const before = await prisma.user.findUniqueOrThrow({
      where: { email: DEMO_EMAIL },
    });
    const response = await login();
    expect(response.body).toEqual({
      accessToken: expect.any(String),
      user: {
        id: before.id,
        email: DEMO_EMAIL,
        nickname: before.nickname,
        isDemo: true,
      },
    });
    const header = (response.headers['set-cookie'] as unknown as string[])[0];
    for (const option of [
      'Max-Age=7200',
      'HttpOnly',
      'SameSite=Strict',
      'Path=/api/auth',
    ]) {
      expect(header).toContain(option);
    }
    expect(header).not.toContain('Secure');
    const payload = jwt.verify(
      cookie(response).slice('refresh_token='.length),
      {
        secret: process.env.JWT_REFRESH_SECRET,
        algorithms: ['HS256'],
      },
    );
    expect(payload.exp - payload.iat).toBe(7200);
    expect(payload.sub).toBe(before.id);
    expect(payload.jti).toEqual(expect.any(String));
    expect(before.refreshTokenHash).toBeNull();
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: before.id } }),
    ).toEqual(before);
    const me = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${response.body.accessToken}`)
      .expect(200);
    expect(me.body).toEqual(response.body.user);
  });

  it('allows both visitors to refresh without rotating cookies or writing the account', async () => {
    const [first, second] = await Promise.all([login(), login()]);
    expect(cookie(first)).not.toBe(cookie(second));
    const before = await prisma.user.findUniqueOrThrow({
      where: { email: DEMO_EMAIL },
    });
    for (const visitor of [first, second]) {
      const response = await refresh(cookie(visitor)).expect(200);
      expect(response.body).toEqual({
        accessToken: expect.any(String),
        user: first.body.user,
      });
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: before.id } }),
    ).toEqual(before);
  });

  it('rejects an expired demo refresh token', async () => {
    const demo = await prisma.user.findUniqueOrThrow({
      where: { email: DEMO_EMAIL },
    });
    const expired = jwt.sign(
      { sub: demo.id },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        algorithm: 'HS256',
        expiresIn: -1,
        jwtid: 'expired-demo',
      },
    );
    await refresh(`refresh_token=${expired}`).expect(401);
  });

  it.each(['missing', 'real'] as const)(
    'returns 503 when the demo email is %s',
    async (state) => {
      await prisma.user.update({
        where: { email: DEMO_EMAIL },
        data:
          state === 'missing'
            ? { email: 'unavailable@dogwalk.invalid' }
            : { isDemo: false },
      });
      const response = await request(app.getHttpServer())
        .post('/api/auth/demo')
        .send({})
        .expect(503);
      expect(response.body.message).toBe(
        '데모 계정을 준비하고 있어요. 잠시 뒤에 다시 시도해 주세요.',
      );
      expect(response.headers['set-cookie']).toBeUndefined();
    },
  );

  it('requires JSON and does not use the password login limiter', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/demo')
      .send('text')
      .expect(415);
    const begin = vi.spyOn(app.get(LoginLimiter), 'begin');
    try {
      await login();
      expect(begin).not.toHaveBeenCalled();
    } finally {
      begin.mockRestore();
    }
  });

  it('clears the cookie while preserving demo location, consent and another visitor session', async () => {
    const first = await login();
    const second = await login();
    const before = await prisma.$queryRaw`
      SELECT refresh_token_hash, ST_AsText(location::geometry) AS location,
        location_consented_at, location_updated_at FROM users WHERE email = ${DEMO_EMAIL}
    `;
    const response = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookie(first))
      .send({})
      .expect(204);
    expect(cookie(response)).toBe('refresh_token=');
    expect(
      await prisma.$queryRaw`
      SELECT refresh_token_hash, ST_AsText(location::geometry) AS location,
        location_consented_at, location_updated_at FROM users WHERE email = ${DEMO_EMAIL}
    `,
    ).toEqual(before);
    await refresh(cookie(second)).expect(200);
  });

  it('does not trust demo claims on a real user refresh token with a different hash', async () => {
    const real = await realUser();
    const token = jwt.sign(
      { sub: real.id, isDemo: true, demo: true },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        algorithm: 'HS256',
        expiresIn: '2h',
        jwtid: 'different-hash',
      },
    );
    await refresh(`refresh_token=${token}`).expect(401);
  });

  it.each([
    ['patch', '/api/users/me', { nickname: '바꾸려는이름' }],
    [
      'patch',
      '/api/users/me',
      { currentPassword: 'password123', newPassword: 'new-password' },
    ],
    ['post', '/api/users/me/location-consent', {}],
    ['delete', '/api/users/me/location-consent', {}],
    ['patch', '/api/users/me/location', { lat: 37.528, lng: 126.932 }],
  ] as const)(
    'rejects demo %s %s before changing the account',
    async (method, path, body) => {
      const response = await login();
      const before = await prisma.user.findUniqueOrThrow({
        where: { email: DEMO_EMAIL },
      });
      const denied = await request(app.getHttpServer())
        [method](path)
        .set('Authorization', `Bearer ${response.body.accessToken}`)
        .send(body)
        .expect(403);
      expect(denied.body.message).toBe(forbiddenMessage);
      expect(
        await prisma.user.findUniqueOrThrow({ where: { id: before.id } }),
      ).toEqual(before);
    },
  );

  it('allows dog and diary writes without photos and rejects all four photo routes without leaving files', async () => {
    const response = await login();
    const authorization = `Bearer ${response.body.accessToken}`;
    const createdDog = await request(app.getHttpServer())
      .post('/api/dogs')
      .set('Authorization', authorization)
      .field('dog', JSON.stringify(dog))
      .expect(201);
    const diaryInput = { ...diary, dogId: createdDog.body.id };
    const createdDiary = await request(app.getHttpServer())
      .post('/api/diaries')
      .set('Authorization', authorization)
      .field('diary', JSON.stringify(diaryInput))
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/dogs/${createdDog.body.id}`)
      .set('Authorization', authorization)
      .field('dog', JSON.stringify({ ...dog, name: '새이름' }))
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/diaries/${createdDiary.body.id}`)
      .set('Authorization', authorization)
      .field('diary', JSON.stringify({ ...diaryInput, title: '새제목' }))
      .expect(200);
    const beforeDogs = await prisma.dog.findMany({ orderBy: { id: 'asc' } });
    const beforeDiaries = await prisma.diary.findMany({
      orderBy: { id: 'asc' },
    });
    const beforePublicFiles = (
      await readdir(publicDirectory, { recursive: true })
    ).sort();
    const beforePrivateFiles = (
      await readdir(privateDirectory, { recursive: true })
    ).sort();
    const beforeImages = await prisma.diaryImage.findMany({
      orderBy: { id: 'asc' },
    });
    const routes = [
      ['post', '/api/dogs', 'dog', dog, 'photo'],
      ['patch', `/api/dogs/${createdDog.body.id}`, 'dog', dog, 'photo'],
      ['post', '/api/diaries', 'diary', diaryInput, 'images'],
      [
        'patch',
        `/api/diaries/${createdDiary.body.id}`,
        'diary',
        diaryInput,
        'images',
      ],
    ] as const;
    for (const [method, path, field, input, imageField] of routes) {
      const denied = await request(app.getHttpServer())
        [method](path)
        .set('Authorization', authorization)
        .field(field, JSON.stringify(input))
        .attach(imageField, jpeg, 'photo.jpg')
        .expect(403);
      expect(denied.body.message).toBe(forbiddenMessage);
      expect(
        (await readdir(publicDirectory, { recursive: true })).sort(),
      ).toEqual(beforePublicFiles);
      expect(
        (await readdir(privateDirectory, { recursive: true })).sort(),
      ).toEqual(beforePrivateFiles);
      expect(
        await prisma.diaryImage.findMany({ orderBy: { id: 'asc' } }),
      ).toEqual(beforeImages);
    }
    expect(await prisma.dog.findMany({ orderBy: { id: 'asc' } })).toEqual(
      beforeDogs,
    );
    expect(await prisma.diary.findMany({ orderBy: { id: 'asc' } })).toEqual(
      beforeDiaries,
    );
    expect(
      await prisma.diaryImage.findMany({ orderBy: { id: 'asc' } }),
    ).toEqual(beforeImages);
  });

  it.each([false, true])(
    'separates maps and walk requests with stale demo locations: %s',
    async (stale) => {
      const demo = await login();
      const authorization = `Bearer ${demo.body.accessToken}`;
      const real = await realUser();
      if (stale) {
        await prisma.$executeRaw`UPDATE users SET location_updated_at = now() - interval '10 minutes' WHERE is_demo`;
      }
      const neighbors = await request(app.getHttpServer())
        .get('/api/users/nearby')
        .set('Authorization', authorization)
        .expect(200);
      const expectedNeighbors = await prisma.user.findMany({
        where: { isDemo: true, id: { not: demo.body.user.id } },
        select: { id: true },
      });
      expect(neighbors.body).toHaveLength(5);
      expect(
        neighbors.body
          .map((user: { userId: number }) => user.userId)
          .sort((a: number, b: number) => a - b),
      ).toEqual(expectedNeighbors.map((user) => user.id).sort((a, b) => a - b));
      const realNeighbors = await request(app.getHttpServer())
        .get('/api/users/nearby')
        .set('Authorization', real.authorization)
        .expect(200);
      expect(realNeighbors.body).toEqual([]);
      const neighbor = await prisma.user.findUniqueOrThrow({
        where: { email: 'neighbor3@dogwalk.invalid' },
      });
      await request(app.getHttpServer())
        .post('/api/walk-requests')
        .set('Authorization', authorization)
        .send({ receiverId: neighbor.id })
        .expect(201);
      for (const [sender, receiverId] of [
        [authorization, real.id],
        [real.authorization, demo.body.user.id],
      ] as const) {
        const denied = await request(app.getHttpServer())
          .post('/api/walk-requests')
          .set('Authorization', sender)
          .send({ receiverId })
          .expect(403);
        expect(denied.body.message).toBe(
          '주변 사용자에게만 산책 요청을 보낼 수 있어요.',
        );
      }
    },
  );

  it('still excludes stale real locations from maps and walk requests', async () => {
    const first = await realUser('first');
    const second = await realUser('second');
    const nearby = await request(app.getHttpServer())
      .get('/api/users/nearby')
      .set('Authorization', first.authorization)
      .expect(200);
    expect(nearby.body.map((user: { userId: number }) => user.userId)).toEqual([
      second.id,
    ]);
    await prisma.$executeRaw`UPDATE users SET location_updated_at = now() - interval '10 minutes' WHERE id = ${second.id}`;
    const after = await request(app.getHttpServer())
      .get('/api/users/nearby')
      .set('Authorization', first.authorization)
      .expect(200);
    expect(after.body).toEqual([]);
    const stale = await request(app.getHttpServer())
      .get('/api/users/nearby')
      .set('Authorization', second.authorization)
      .expect(409);
    expect(stale.body.message).toBe(
      '내 위치가 5분 넘게 갱신되지 않았어요. 브라우저 위치 권한을 확인해 주세요.',
    );
    for (const [sender, receiverId] of [
      [first.authorization, second.id],
      [second.authorization, first.id],
    ] as const) {
      await request(app.getHttpServer())
        .post('/api/walk-requests')
        .set('Authorization', sender)
        .send({ receiverId })
        .expect(403);
    }
  });
});
