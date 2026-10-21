import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app-setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const dog = {
  name: '보리',
  breed: '푸들',
  size: 'SMALL',
  gender: 'FEMALE',
  neutered: false,
  birthYear: 2020,
  personality: '산책을 좋아해요',
} as const;
const coordinates = { lat: 37.56651, lng: 126.97801 };
const rounded = { lat: 37.566, lng: 126.978 };

describe('Location (e2e)', () => {
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

  async function createUser(name: string) {
    const email = `${name}@example.com`;
    const password = 'password123';
    const signup = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email,
        password,
        nickname: `보호자${name}`,
        dog: { ...dog, name: `반려견${name}` },
      })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return {
      id: signup.body.id as number,
      cookie: login.headers['set-cookie'] as unknown as string[],
      email,
      password,
      authorization: `Bearer ${login.body.accessToken}`,
    };
  }

  async function locate(
    user: Awaited<ReturnType<typeof createUser>>,
    lat = coordinates.lat,
    lng = coordinates.lng,
  ) {
    await request(app.getHttpServer())
      .post('/api/users/me/location-consent')
      .set('Authorization', user.authorization)
      .expect(204);
    return request(app.getHttpServer())
      .patch('/api/users/me/location')
      .set('Authorization', user.authorization)
      .send({ lat, lng })
      .expect(200);
  }

  async function stored(userId: number) {
    const [row] = await prisma.$queryRaw<
      {
        lat: number | null;
        lng: number | null;
        consentedAt: Date | null;
        updatedAt: Date | null;
      }[]
    >`SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
      location_consented_at AS "consentedAt", location_updated_at AS "updatedAt"
      FROM users WHERE id = ${userId}`;
    return row;
  }

  it('requires authentication for all five endpoints', async () => {
    await request(app.getHttpServer())
      .get('/api/users/me/location')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/users/me/location-consent')
      .expect(401);
    await request(app.getHttpServer())
      .delete('/api/users/me/location-consent')
      .expect(401);
    await request(app.getHttpServer())
      .patch('/api/users/me/location')
      .send(coordinates)
      .expect(401);
    await request(app.getHttpServer()).get('/api/users/nearby').expect(401);
  });

  it('starts without consent and never saves a location before consent', async () => {
    const user = await createUser('A');
    const response = await request(app.getHttpServer())
      .get('/api/users/me/location')
      .set('Authorization', user.authorization)
      .expect(200);
    expect(response.body).toEqual({
      consented: false,
      lat: null,
      lng: null,
      updatedAt: null,
    });
    const denied = await request(app.getHttpServer())
      .patch('/api/users/me/location')
      .set('Authorization', user.authorization)
      .send(coordinates)
      .expect(403);
    expect(denied.body.message).toBe('위치 수집에 동의해 주세요.');
    expect(await stored(user.id)).toEqual({
      lat: null,
      lng: null,
      consentedAt: null,
      updatedAt: null,
    });
  });

  it('rounds both coordinates in the response and database and preserves the first consent', async () => {
    const user = await createUser('A');
    const saved = await locate(user);
    const first = await stored(user.id);
    expect(saved.body).toEqual({ ...rounded, updatedAt: expect.any(String) });
    expect(first).toEqual({
      ...rounded,
      consentedAt: expect.any(Date),
      updatedAt: new Date(saved.body.updatedAt),
    });
    await request(app.getHttpServer())
      .post('/api/users/me/location-consent')
      .set('Authorization', user.authorization)
      .expect(204);
    expect((await stored(user.id)).consentedAt).toEqual(first.consentedAt);
    const response = await request(app.getHttpServer())
      .get('/api/users/me/location')
      .set('Authorization', user.authorization)
      .expect(200);
    expect(response.body).toEqual({ consented: true, ...saved.body });
  });

  it.each([
    { lat: 91, lng: 0 },
    { lat: -91, lng: 0 },
    { lat: 0, lng: 181 },
    { lat: 0, lng: -181 },
    { lat: '37', lng: 127 },
    { lat: 37, lng: '127' },
    { lng: 127 },
    { lat: 37 },
    { lat: null, lng: 127 },
    { lat: 37, lng: null },
    { ...coordinates, extra: true },
  ])(
    'rejects invalid input %j without replacing the location',
    async (input) => {
      const user = await createUser('A');
      await locate(user);
      const before = await stored(user.id);
      await request(app.getHttpServer())
        .patch('/api/users/me/location')
        .set('Authorization', user.authorization)
        .send(input)
        .expect(400);
      expect(await stored(user.id)).toEqual(before);
    },
  );

  it.each([
    { lat: 90, lng: 180 },
    { lat: -90, lng: -180 },
    { lat: 0, lng: 0 },
  ])('accepts inclusive coordinate boundaries %j', async (input) => {
    const user = await createUser('A');
    const response = await locate(user, input.lat, input.lng);
    expect(response.body).toMatchObject(input);
    expect(await stored(user.id)).toMatchObject(input);
  });

  it('requires a saved and fresh location before searching', async () => {
    const user = await createUser('A');
    const missing = await request(app.getHttpServer())
      .get('/api/users/nearby')
      .set('Authorization', user.authorization)
      .expect(409);
    expect(missing.body.message).toBe('먼저 내 위치를 저장해 주세요.');
    await locate(user);
    await prisma.$executeRaw`UPDATE users SET location_updated_at = now() - interval '6 minutes' WHERE id = ${user.id}`;
    const stale = await request(app.getHttpServer())
      .get('/api/users/nearby')
      .set('Authorization', user.authorization)
      .expect(409);
    expect(stale.body.message).toBe(
      '내 위치가 5분 넘게 갱신되지 않았어요. 브라우저 위치 권한을 확인해 주세요.',
    );
    await locate(user);
    const fresh = await request(app.getHttpServer())
      .get('/api/users/nearby')
      .set('Authorization', user.authorization)
      .expect(200);
    expect(fresh.body).toEqual([]);
  });

  it('returns only fresh consenting neighbors within 1km, ordered by distance then id, with their public dogs', async () => {
    const a = await createUser('A');
    const b = await createUser('B');
    const c = await createUser('C');
    const d = await createUser('D');
    const e = await createUser('E');
    const f = await createUser('F');
    const g = await createUser('G');
    await locate(a);
    await locate(b, 37.57, 126.978);
    await locate(c, 37.58, 126.978);
    await locate(d, 37.568, 126.978);
    await locate(e, 37.568, 126.978);
    await locate(f, 37.568, 126.98);
    await locate(g, 37.5701, 126.9781);
    await request(app.getHttpServer())
      .delete('/api/users/me/location-consent')
      .set('Authorization', d.authorization)
      .expect(204);
    await prisma.$executeRaw`UPDATE users SET location_updated_at = now() - interval '6 minutes' WHERE id = ${e.id}`;
    await prisma.$executeRaw`UPDATE users SET location_updated_at = now() - interval '4 minutes' WHERE id = ${b.id}`;
    // Inserting in reverse time order checks registration ordering, not insertion order.
    await prisma.dog.create({
      data: {
        ...dog,
        ownerId: b.id,
        name: '먼저등록',
        createdAt: new Date('2020-01-01'),
      },
    });
    const response = await request(app.getHttpServer())
      .get('/api/users/nearby')
      .set('Authorization', a.authorization)
      .expect(200);
    expect(
      response.body.map((user: { userId: number }) => user.userId),
    ).toEqual([f.id, ...[b.id, g.id].sort((x, y) => x - y)]);
    expect(response.body[0].distanceM).toBeGreaterThan(250);
    expect(response.body[0].distanceM).toBeLessThan(350);
    expect(response.body[1].distanceM).toBeGreaterThan(400);
    expect(response.body[1].distanceM).toBeLessThan(500);
    expect(response.body[1].distanceM).toBe(response.body[2].distanceM);
    for (const neighbor of response.body) {
      const expectedDogs = await prisma.dog.findMany({
        where: { ownerId: neighbor.userId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      expect(neighbor.dogs).toEqual(
        expectedDogs.map(({ ownerId: _ownerId, createdAt, ...dog }) => ({
          ...dog,
          createdAt: createdAt.toISOString(),
        })),
      );
      expect(Object.keys(neighbor).sort()).toEqual(
        ['userId', 'nickname', 'lat', 'lng', 'distanceM', 'dogs'].sort(),
      );
      expect(Number.isInteger(neighbor.distanceM)).toBe(true);
      expect(neighbor.lat).toBe(neighbor.userId === f.id ? 37.568 : 37.57);
      expect(neighbor.lng).toBe(neighbor.userId === f.id ? 126.98 : 126.978);
    }
    expect(JSON.stringify(response.body)).not.toContain('email');
    expect(JSON.stringify(response.body)).not.toContain('ownerId');
  });

  it('clears all location columns on withdrawal and disappears from searches immediately', async () => {
    const a = await createUser('A');
    const b = await createUser('B');
    await locate(a);
    await locate(b);
    const before = await request(app.getHttpServer())
      .get('/api/users/nearby')
      .set('Authorization', a.authorization)
      .expect(200);
    expect(before.body.map((user: { userId: number }) => user.userId)).toEqual([
      b.id,
    ]);
    await request(app.getHttpServer())
      .delete('/api/users/me/location-consent')
      .set('Authorization', b.authorization)
      .expect(204);
    expect(await stored(b.id)).toEqual({
      lat: null,
      lng: null,
      consentedAt: null,
      updatedAt: null,
    });
    const after = await request(app.getHttpServer())
      .get('/api/users/nearby')
      .set('Authorization', a.authorization)
      .expect(200);
    expect(after.body).toEqual([]);
    await request(app.getHttpServer())
      .patch('/api/users/me/location')
      .set('Authorization', b.authorization)
      .send(coordinates)
      .expect(403);
  });

  it('withdraws location on logout and requires consent after logging in again', async () => {
    const a = await createUser('A');
    const b = await createUser('B');
    await locate(a);
    await locate(b);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .send({})
      .set('Cookie', b.cookie)
      .expect(204);
    expect(await stored(b.id)).toEqual({
      lat: null,
      lng: null,
      consentedAt: null,
      updatedAt: null,
    });
    const nearby = await request(app.getHttpServer())
      .get('/api/users/nearby')
      .set('Authorization', a.authorization)
      .expect(200);
    expect(nearby.body).toEqual([]);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: b.email, password: b.password })
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/users/me/location')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send(coordinates)
      .expect(403);
  });

  it('preserves the new device location when an old device logs out', async () => {
    const user = await createUser('A');
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    await locate({
      ...user,
      authorization: `Bearer ${login.body.accessToken}`,
    });
    const before = await stored(user.id);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .send({})
      .set('Cookie', user.cookie)
      .expect(204);
    expect(await stored(user.id)).toEqual(before);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({})
      .set('Cookie', login.headers['set-cookie'])
      .expect(200);
  });

  it('does not retain a location when saving races with withdrawal', async () => {
    const user = await createUser('A');
    await locate(user);
    const [save] = await Promise.all([
      request(app.getHttpServer())
        .patch('/api/users/me/location')
        .set('Authorization', user.authorization)
        .send(coordinates),
      request(app.getHttpServer())
        .delete('/api/users/me/location-consent')
        .set('Authorization', user.authorization)
        .expect(204),
    ]);
    expect([200, 403]).toContain(save.status);
    expect(await stored(user.id)).toEqual({
      lat: null,
      lng: null,
      consentedAt: null,
      updatedAt: null,
    });
  });
});
