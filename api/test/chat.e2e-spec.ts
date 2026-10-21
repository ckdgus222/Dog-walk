import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app-setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { WalkRequestStatus } from '../src/generated/prisma/client.js';

type Account = { id: number; nickname: string; token: string };

describe('Chat (e2e)', () => {
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
    await prisma.diaryImage.deleteMany();
    await prisma.diary.deleteMany();
    await prisma.chatMessage.deleteMany();
    await prisma.walkRequest.deleteMany();
    await prisma.dog.deleteMany();
    await prisma.user.deleteMany();
    a = await createUser('A');
    b = await createUser('B');
    c = await createUser('C');
  });

  afterEach(() => {
    for (const socket of sockets) socket.disconnect();
    sockets.length = 0;
  });

  afterAll(async () => {
    await app?.close();
  });

  async function createUser(name: string): Promise<Account> {
    const email = `chat-${name}@example.com`;
    const password = 'password123';
    const nickname = `채팅${name}`;
    const signup = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email,
        password,
        nickname,
        dog: {
          name: '보리',
          breed: '푸들',
          size: 'SMALL',
          gender: 'FEMALE',
          neutered: false,
          birthYear: 2020,
          personality: '산책을 좋아해요',
        },
      })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return { id: signup.body.id, nickname, token: login.body.accessToken };
  }

  function createRequest(status: WalkRequestStatus = 'ACCEPTED') {
    return prisma.walkRequest.create({
      data: { requesterId: a.id, receiverId: b.id, status },
    });
  }

  function history(user: Account, id: number) {
    return request(app.getHttpServer())
      .get(`/api/walk-requests/${id}/messages`)
      .set('Authorization', `Bearer ${user.token}`);
  }

  async function connect(user: Account) {
    const socket = io(url, {
      auth: { token: user.token },
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

  it('requires login and hides missing requests and nonparticipants', async () => {
    const walk = await createRequest();
    await request(app.getHttpServer())
      .get(`/api/walk-requests/${walk.id}/messages`)
      .expect(401);
    for (const [user, id] of [
      [c, walk.id],
      [a, 2147483647],
      [a, 2147483648],
    ] as const) {
      expect((await history(user, id).expect(404)).body.message).toBe(
        '산책 요청을 찾을 수 없어요.',
      );
    }
    await request(app.getHttpServer())
      .get('/api/walk-requests/invalid/messages')
      .set('Authorization', `Bearer ${a.token}`)
      .expect(400);
  });

  it.each(['PENDING', 'REJECTED', 'CANCELED'] as const)(
    'denies history for %s to both participants',
    async (status) => {
      const walk = await createRequest(status);
      for (const user of [a, b]) {
        expect((await history(user, walk.id).expect(403)).body.message).toBe(
          '수락된 산책 요청에서만 채팅할 수 있어요.',
        );
      }
      expect((await history(c, walk.id).expect(404)).body.message).toBe(
        '산책 요청을 찾을 수 없어요.',
      );
    },
  );

  it('returns each counterpart and the latest 50 messages ordered by createdAt then id without private fields', async () => {
    const walk = await createRequest();
    const stored = [];
    for (let index = 0; index < 55; index += 1) {
      stored.push(
        await prisma.chatMessage.create({
          data: {
            walkRequestId: walk.id,
            senderId: a.id,
            content: `message ${index}`,
            createdAt: new Date(
              Date.UTC(2026, 9, 21, 0, 0, Math.floor(index / 2)),
            ),
          },
        }),
      );
    }
    // A higher ID with an older timestamp must not displace recent messages.
    await prisma.chatMessage.create({
      data: {
        walkRequestId: walk.id,
        senderId: b.id,
        content: 'older',
        createdAt: new Date('2025-01-01'),
      },
    });
    const otherWalk = await createRequest();
    await prisma.chatMessage.create({
      data: {
        walkRequestId: otherWalk.id,
        senderId: a.id,
        content: 'other room',
      },
    });
    for (const [user, counterpart] of [
      [a, b],
      [b, a],
    ]) {
      const response = await history(user, walk.id).expect(200);
      expect(response.body.counterpart).toEqual({
        id: counterpart.id,
        nickname: counterpart.nickname,
      });
      expect(response.body.messages).toEqual(
        stored.slice(-50).map((message) => ({
          ...message,
          createdAt: message.createdAt.toISOString(),
          senderNickname: a.nickname,
        })),
      );
      expect(JSON.stringify(response.body)).not.toContain('email');
    }
    expect(
      (await history(a, otherWalk.id).expect(200)).body.messages,
    ).toHaveLength(1);
  });

  it('saves trimmed content and emits exactly once to both participants and the sender’s second socket', async () => {
    const walk = await createRequest();
    const clients = await Promise.all([
      connect(a),
      connect(b),
      connect(a),
      connect(c),
    ]);
    const events = clients.map((socket) => {
      const listener = vi.fn();
      socket.on('chat:message', listener);
      return listener;
    });
    expect(
      await clients[0].timeout(2000).emitWithAck('chat:send', {
        walkRequestId: walk.id,
        content: '  함께 걸어요  ',
      }),
    ).toEqual({ ok: true });
    const stored = await prisma.chatMessage.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe('함께 걸어요');
    const expected = {
      ...stored[0],
      createdAt: stored[0].createdAt.toISOString(),
      senderNickname: a.nickname,
    };
    await vi.waitFor(() => {
      for (const listener of events.slice(0, 3))
        expect(listener).toHaveBeenCalledExactlyOnceWith(expected);
    });
    await delay(150);
    for (const listener of events.slice(0, 3))
      expect(listener).toHaveBeenCalledTimes(1);
    expect(events[3]).not.toHaveBeenCalled();
  });

  it('rejects every invalid payload, outsider, missing request and unaccepted status without saves or events', async () => {
    const walk = await createRequest();
    const sender = await connect(a);
    const receiver = await connect(b);
    const outsider = await connect(c);
    const events = vi.fn();
    for (const socket of [sender, receiver, outsider])
      socket.on('chat:message', events);
    const inputError = '메시지는 1~500자로 입력해 주세요.';
    const cases: { socket: Socket; payload: unknown; message: string }[] = [
      ...['', '  \n ', 'a'.repeat(501), 123, null].map((content) => ({
        socket: sender,
        payload: { walkRequestId: walk.id, content },
        message: inputError,
      })),
      ...[0, -1, 1.5, '1', null].map((walkRequestId) => ({
        socket: sender,
        payload: { walkRequestId, content: 'hello' },
        message: inputError,
      })),
      { socket: sender, payload: null, message: inputError },
      {
        socket: outsider,
        payload: { walkRequestId: walk.id, content: 'hello' },
        message: '산책 요청을 찾을 수 없어요.',
      },
      {
        socket: sender,
        payload: { walkRequestId: 2147483647, content: 'hello' },
        message: '산책 요청을 찾을 수 없어요.',
      },
    ];
    for (const status of ['PENDING', 'REJECTED', 'CANCELED'] as const) {
      const unaccepted = await createRequest(status);
      cases.push({
        socket: sender,
        payload: { walkRequestId: unaccepted.id, content: 'hello' },
        message: '수락된 산책 요청에서만 채팅할 수 있어요.',
      });
    }
    for (const { socket, payload, message } of cases) {
      expect(
        await socket.timeout(2000).emitWithAck('chat:send', payload),
      ).toEqual({ ok: false, message });
      expect(await prisma.chatMessage.count()).toBe(0);
    }
    await delay(150);
    expect(events).not.toHaveBeenCalled();
  });
});
