import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { setTimeout as delay } from 'node:timers/promises';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app-setup.js';
import { publicDogSelect } from '../src/dogs/dogs.service.js';
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
type Account = {
  id: number;
  nickname: string;
  token: string;
  authorization: string;
};

describe('Walk requests and Socket.IO (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let url: string;
  let a: Account;
  let b: Account;
  let c: Account;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.walkRequest.deleteMany();
    await prisma.dog.deleteMany();
    await prisma.user.deleteMany();
    a = await createUser('A');
    b = await createUser('B');
    c = await createUser('C');
    await locate(a, 37.566);
    await locate(b, 37.57);
  });

  afterEach(() => {
    for (const socket of sockets) socket.disconnect();
    sockets.length = 0;
  });

  afterAll(async () => {
    await app?.close();
  });

  async function createUser(name: string): Promise<Account> {
    const email = `${name}@example.com`;
    const password = 'password123';
    const nickname = `보호자${name}`;
    const signup = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email,
        password,
        nickname,
        dog: { ...dog, name: `반려견${name}` },
      })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return {
      id: signup.body.id,
      nickname,
      token: login.body.accessToken,
      authorization: `Bearer ${login.body.accessToken}`,
    };
  }

  async function locate(user: Account, lat: number) {
    await request(app.getHttpServer())
      .post('/api/users/me/location-consent')
      .set('Authorization', user.authorization)
      .expect(204);
    await request(app.getHttpServer())
      .patch('/api/users/me/location')
      .set('Authorization', user.authorization)
      .send({ lat, lng: 126.978 })
      .expect(200);
  }

  function create(sender = a, receiverId = b.id, message?: string) {
    return request(app.getHttpServer())
      .post('/api/walk-requests')
      .set('Authorization', sender.authorization)
      .send({ receiverId, message });
  }

  function change(user: Account, id: number, action: string) {
    return request(app.getHttpServer())
      .patch(`/api/walk-requests/${id}/${action}`)
      .set('Authorization', user.authorization);
  }

  function list(user: Account, box: string) {
    return request(app.getHttpServer())
      .get(`/api/walk-requests?box=${box}`)
      .set('Authorization', user.authorization)
      .expect(200);
  }

  async function connect(token: string) {
    const socket = io(url, {
      auth: { token },
      autoConnect: false,
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
      socket.connect();
    });
    return socket;
  }

  it('requires authentication on all six endpoints', async () => {
    await request(app.getHttpServer())
      .post('/api/walk-requests')
      .send({ receiverId: b.id })
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/walk-requests?box=received')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/walk-requests/pending-count')
      .expect(401);
    for (const action of ['accept', 'reject', 'cancel']) {
      await request(app.getHttpServer())
        .patch(`/api/walk-requests/1/${action}`)
        .expect(401);
    }
  });

  it('rejects self requests and invalid fields without saving', async () => {
    const self = await create(a, a.id).expect(400);
    expect(self.body.message).toBe('나에게는 산책 요청을 보낼 수 없어요.');
    for (const body of [
      { receiverId: '2' },
      { receiverId: 0 },
      { receiverId: -1 },
      { receiverId: 1.5 },
      { receiverId: b.id, message: 'a'.repeat(101) },
      { receiverId: b.id, extra: true },
      { receiverId: b.id, message: null },
      { receiverId: b.id, message: 1 },
    ]) {
      await request(app.getHttpServer())
        .post('/api/walk-requests')
        .set('Authorization', a.authorization)
        .send(body)
        .expect(400);
    }
    expect(await prisma.walkRequest.count()).toBe(0);
  });

  it.each([
    ['  같이 걸어요  ', '같이 걸어요'],
    ['   ', null],
    ['', null],
    [undefined, null],
    [` ${'a'.repeat(100)} `, 'a'.repeat(100)],
  ])(
    'normalizes an optional message before saving',
    async (message, expected) => {
      const response = await create(a, b.id, message ?? undefined).expect(201);
      expect(response.body.message).toBe(expected);
      expect(
        (
          await prisma.walkRequest.findUniqueOrThrow({
            where: { id: response.body.id },
          })
        ).message,
      ).toBe(expected);
    },
  );

  it.each([
    'far',
    'withdrawn',
    'stale receiver',
    'missing receiver',
    'missing location',
    'stale requester',
  ])(
    'rejects %s with the same 403 and no saved request or event',
    async (condition) => {
      const receiver = await connect(b.token);
      const received = vi.fn();
      receiver.on('walk-request:received', received);
      if (condition === 'far') await locate(b, 37.58);
      if (condition === 'withdrawn')
        await request(app.getHttpServer())
          .delete('/api/users/me/location-consent')
          .set('Authorization', b.authorization)
          .expect(204);
      if (condition === 'missing location')
        await request(app.getHttpServer())
          .delete('/api/users/me/location-consent')
          .set('Authorization', a.authorization)
          .expect(204);
      if (condition === 'stale receiver' || condition === 'stale requester') {
        const id = condition === 'stale receiver' ? b.id : a.id;
        await prisma.$executeRaw`UPDATE users SET location_updated_at = now() - interval '8 days' WHERE id = ${id}`;
      }
      const response = await create(
        a,
        condition === 'missing receiver' ? 2147483647 : b.id,
      ).expect(403);
      expect(response.body.message).toBe(
        '주변 사용자에게만 산책 요청을 보낼 수 있어요.',
      );
      expect(await prisma.walkRequest.count()).toBe(0);
      await delay(150);
      expect(received).not.toHaveBeenCalled();
    },
  );

  it('returns public counterparts, lists both perspectives, and counts only received pending requests', async () => {
    const created = await create(a, b.id, '같이 걸어요').expect(201);
    const dogs = await prisma.dog.findMany({
      where: { ownerId: b.id },
      select: publicDogSelect,
    });
    expect(created.body).toEqual({
      id: expect.any(Number),
      status: 'PENDING',
      message: '같이 걸어요',
      createdAt: expect.any(String),
      respondedAt: null,
      counterpart: {
        id: b.id,
        nickname: b.nickname,
        dogs: JSON.parse(JSON.stringify(dogs)),
      },
    });
    const received = await list(b, 'received');
    expect(received.body).toHaveLength(1);
    expect(received.body[0].counterpart).toMatchObject({
      id: a.id,
      nickname: a.nickname,
      dogs: [{ name: '반려견A' }],
    });
    expect((await list(a, 'sent')).body).toEqual([created.body]);
    expect((await list(c, 'received')).body).toEqual([]);
    expect((await list(c, 'sent')).body).toEqual([]);
    const serialized = JSON.stringify(received.body);
    for (const privateField of [
      'email',
      'location',
      'passwordHash',
      'ownerId',
      'requesterId',
      'receiverId',
    ])
      expect(serialized).not.toContain(privateField);
    for (const [user, count] of [
      [a, 0],
      [b, 1],
      [c, 0],
    ] as const) {
      await request(app.getHttpServer())
        .get('/api/walk-requests/pending-count')
        .set('Authorization', user.authorization)
        .expect(200, { count });
    }
    for (const query of ['', '?box=all', '?box=received&extra=true']) {
      await request(app.getHttpServer())
        .get(`/api/walk-requests${query}`)
        .set('Authorization', a.authorization)
        .expect(400);
    }
  });

  it('lists all states by creation time descending, then id descending', async () => {
    const first = await create().expect(201);
    await change(a, first.body.id, 'cancel').expect(200);
    const second = await create().expect(201);
    await change(b, second.body.id, 'reject').expect(200);
    const third = await create().expect(201);
    await prisma.walkRequest.updateMany({
      data: { createdAt: new Date('2026-01-01') },
    });
    const olderWithHigherId = await prisma.walkRequest.create({
      data: {
        requesterId: a.id,
        receiverId: b.id,
        status: 'ACCEPTED',
        createdAt: new Date('2025-01-01'),
      },
    });
    const expected = [
      third.body.id,
      second.body.id,
      first.body.id,
      olderWithHigherId.id,
    ];
    for (const [user, box] of [
      [a, 'sent'],
      [b, 'received'],
    ] as const) {
      expect(
        (await list(user, box)).body.map((row: { id: number }) => row.id),
      ).toEqual(expected);
    }
  });

  it('returns directional conflict codes and emits exactly once only to the receiver for concurrent creates', async () => {
    const senderSocket = await connect(a.token);
    const receiverSocket = await connect(b.token);
    const thirdSocket = await connect(c.token);
    const senderEvents = vi.fn();
    const receiverEvents = vi.fn();
    const thirdEvents = vi.fn();
    senderSocket.on('walk-request:received', senderEvents);
    receiverSocket.on('walk-request:received', receiverEvents);
    thirdSocket.on('walk-request:received', thirdEvents);
    const responses = await Promise.all([create(), create()]);
    expect(
      responses
        .map((response) => response.status)
        .sort((left, right) => left - right),
    ).toEqual([201, 409]);
    expect(
      responses.find((response) => response.status === 409)?.body.code,
    ).toBe('ALREADY_PENDING');
    expect((await create().expect(409)).body.code).toBe('ALREADY_PENDING');
    expect((await create(b, a.id).expect(409)).body.code).toBe(
      'REVERSE_PENDING',
    );
    expect(await prisma.walkRequest.count()).toBe(1);
    const received = (await list(b, 'received')).body[0];
    await vi.waitFor(() =>
      expect(receiverEvents).toHaveBeenCalledExactlyOnceWith(received),
    );
    await delay(150);
    expect(receiverEvents).toHaveBeenCalledTimes(1);
    expect(senderEvents).not.toHaveBeenCalled();
    expect(thirdEvents).not.toHaveBeenCalled();
  });

  it('allows only one direction to win concurrent opposite requests', async () => {
    const responses = await Promise.all([create(), create(b, a.id)]);
    expect(
      responses
        .map((response) => response.status)
        .sort((left, right) => left - right),
    ).toEqual([201, 409]);
    expect(
      responses.find((response) => response.status === 409)?.body.code,
    ).toBe('REVERSE_PENDING');
    expect(await prisma.walkRequest.count()).toBe(1);
  });

  it.each([
    ['accept', 'ACCEPTED'],
    ['reject', 'REJECTED'],
    ['cancel', 'CANCELED'],
  ])(
    'checks permissions, records response time, emits to the counterpart, and permits a new request after %s',
    async (action, status) => {
      const created = await create().expect(201);
      const id: number = created.body.id;
      const actor = action === 'cancel' ? a : b;
      const counterpart = action === 'cancel' ? b : a;
      const actorEvents = vi.fn();
      const counterpartEvents = vi.fn();
      const thirdEvents = vi.fn();
      (await connect(actor.token)).on('walk-request:changed', actorEvents);
      (await connect(counterpart.token)).on(
        'walk-request:changed',
        counterpartEvents,
      );
      (await connect(c.token)).on('walk-request:changed', thirdEvents);
      expect(
        (await change(counterpart, id, action).expect(403)).body.message,
      ).toBe('이 요청을 처리할 권한이 없어요.');
      expect((await change(c, id, action).expect(404)).body.message).toBe(
        '산책 요청을 찾을 수 없어요.',
      );
      expect(
        (await change(actor, 2147483647, action).expect(404)).body.message,
      ).toBe('산책 요청을 찾을 수 없어요.');
      await request(app.getHttpServer())
        .patch(`/api/walk-requests/not-an-id/${action}`)
        .set('Authorization', actor.authorization)
        .expect(400);
      await change(actor, id, action).expect(200, { id, status });
      const stored = await prisma.walkRequest.findUniqueOrThrow({
        where: { id },
      });
      expect(stored.status).toBe(status);
      if (action === 'cancel') expect(stored.respondedAt).toBeNull();
      else expect(stored.respondedAt).toBeInstanceOf(Date);
      expect((await change(actor, id, action).expect(409)).body.message).toBe(
        '이미 처리된 요청이에요.',
      );
      await change(counterpart, id, action).expect(409);
      await change(c, id, action).expect(404);
      await request(app.getHttpServer())
        .get('/api/walk-requests/pending-count')
        .set('Authorization', b.authorization)
        .expect(200, { count: 0 });
      await vi.waitFor(() =>
        expect(counterpartEvents).toHaveBeenCalledExactlyOnceWith({
          id,
          status,
        }),
      );
      await delay(150);
      expect(counterpartEvents).toHaveBeenCalledTimes(1);
      expect(actorEvents).not.toHaveBeenCalled();
      expect(thirdEvents).not.toHaveBeenCalled();
      await create().expect(201);
    },
  );

  it('allows exactly one winner when accept and cancel race', async () => {
    const created = await create().expect(201);
    const id: number = created.body.id;
    const responses = await Promise.all([
      change(b, id, 'accept'),
      change(a, id, 'cancel'),
    ]);
    expect(
      responses
        .map((response) => response.status)
        .sort((left, right) => left - right),
    ).toEqual([200, 409]);
    const winner = responses.find((response) => response.status === 200)!;
    const stored = await prisma.walkRequest.findUniqueOrThrow({
      where: { id },
    });
    expect(stored.status).toBe(winner.body.status);
    expect(stored.respondedAt === null).toBe(stored.status === 'CANCELED');
  });

  it.each([undefined, 'invalid', 123])(
    'rejects invalid socket credentials %s before connection',
    async (token) => {
      const socket = io(url, {
        auth: { token },
        autoConnect: false,
        reconnection: false,
      });
      sockets.push(socket);
      const connected = vi.fn();
      socket.on('connect', connected);
      const error = await new Promise<Error>((resolve) => {
        socket.once('connect_error', resolve);
        socket.connect();
      });
      expect(error.message).toBe('unauthorized');
      expect(connected).not.toHaveBeenCalled();
      expect(socket.connected).toBe(false);
    },
  );

  it('disconnects at access token expiry with a server disconnect reason', async () => {
    const jwt = new JwtService();
    const token = jwt.sign(
      { sub: a.id },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        algorithm: 'HS256',
        expiresIn: 2,
      },
    );
    const startedAt = Date.now();
    const socket = await connect(token);
    const reason = await new Promise<string>((resolve) => {
      socket.once('disconnect', resolve);
    });
    expect(reason).toBe('io server disconnect');
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(800);
    expect(Date.now() - startedAt).toBeLessThan(3500);
    expect(socket.connected).toBe(false);
  });
});
