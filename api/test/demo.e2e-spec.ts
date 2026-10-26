import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { Client } from 'pg';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app-setup.js';
import { LoginLimiter } from '../src/auth/login-limiter.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDemo } from '../src/demo/reset-demo.js';

const counts = {
  users: 6,
  dogs: 9,
  posts: 5,
  comments: 5,
  diaries: 7,
  walkRequests: 2,
  chatMessages: 6,
};
const dog = {
  name: '산책친구',
  breed: '믹스',
  size: 'SMALL',
  gender: 'FEMALE',
  neutered: true,
  birthYear: 2021,
  personality: '차분해요',
} as const;

// Explicit gates put the competing write inside the deletion window, rather
// than relying on timing or making resetDemo expose test-only callbacks.
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Demo reset (e2e)', () => {
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

  async function snapshot() {
    return {
      users: await prisma.user.findMany({ orderBy: { id: 'asc' } }),
      locations:
        await prisma.$queryRaw`SELECT id, ST_AsText(location::geometry) AS location FROM users ORDER BY id`,
      dogs: await prisma.dog.findMany({ orderBy: { id: 'asc' } }),
      posts: await prisma.post.findMany({ orderBy: { id: 'asc' } }),
      comments: await prisma.comment.findMany({ orderBy: { id: 'asc' } }),
      diaries: await prisma.diary.findMany({ orderBy: { id: 'asc' } }),
      images: await prisma.diaryImage.findMany({ orderBy: { id: 'asc' } }),
      walkRequests: await prisma.walkRequest.findMany({
        orderBy: { id: 'asc' },
      }),
      chatMessages: await prisma.chatMessage.findMany({
        orderBy: { id: 'asc' },
      }),
    };
  }

  async function expectCounts(extraPosts = 0) {
    const state = await snapshot();
    for (const [name, count] of Object.entries(counts)) {
      expect(state[name as keyof typeof counts]).toHaveLength(
        count + (name === 'posts' ? extraPosts : 0),
      );
    }
    expect(state.images).toHaveLength(0);
  }

  function createRealUser(suffix = 'real', email = `${suffix}@example.com`) {
    return prisma.user.create({
      data: {
        email,
        nickname: suffix,
        passwordHash: 'unused-test-hash',
        dogs: { create: dog },
        posts: { create: { title: '남겨 둘 글', content: '실제 사용자 글' } },
      },
      include: { dogs: true, posts: true },
    });
  }

  function pauseReset() {
    const paused = gate();
    const resume = gate();
    const client = prisma.$extends({
      query: {
        chatMessage: {
          async deleteMany({ args, query }) {
            const result = await query(args);
            paused.resolve();
            await resume.promise;
            return result;
          },
        },
      },
    });
    // The query-only extension preserves model shapes, but Prisma's generated
    // transaction overloads are not assignable to the unextended client type.
    return { client: client as unknown as PrismaService, paused, resume };
  }

  async function expectBlocked(pid: number) {
    await vi.waitFor(
      async () => {
        const [row] = await prisma.$queryRaw<{ blocked: boolean }[]>`
        SELECT cardinality(pg_blocking_pids(${pid}::integer)) > 0 AS blocked
      `;
        expect(row.blocked).toBe(true);
      },
      { timeout: 3000, interval: 20 },
    );
  }

  it('creates the complete photo-free dataset and preserves user IDs on repeated resets', async () => {
    const startedAt = new Date();
    expect(await resetDemo(prisma)).toEqual(counts);
    await expectCounts();
    const first = await snapshot();
    expect(
      first.users.every(
        (user) => user.isDemo && user.refreshTokenHash === null,
      ),
    ).toBe(true);
    expect(
      first.users.every((user) => /^\$2[ab]\$10\$/.test(user.passwordHash)),
    ).toBe(true);
    expect(new Set(first.users.map((user) => user.passwordHash)).size).toBe(6);
    expect(first.dogs.every((entry) => entry.photoUrl === null)).toBe(true);
    const demo = first.users.find(
      (user) => user.email === 'demo@dogwalk.invalid',
    )!;
    expect(
      first.dogs.filter((entry) => entry.ownerId === demo.id),
    ).toHaveLength(1);
    expect(
      first.diaries.filter((entry) => entry.authorId === demo.id),
    ).toHaveLength(2);
    for (const user of first.users.filter((entry) => entry.id !== demo.id)) {
      const owned = first.dogs.filter((entry) => entry.ownerId === user.id);
      expect(owned.length).toBeGreaterThanOrEqual(1);
      expect(owned.length).toBeLessThanOrEqual(2);
    }
    expect(
      first.posts.every(
        (post) => post.authorId !== demo.id && post.createdAt < startedAt,
      ),
    ).toBe(true);
    expect(
      first.comments.every((comment) => comment.createdAt < startedAt),
    ).toBe(true);
    expect(
      first.chatMessages.every((message) => message.createdAt < startedAt),
    ).toBe(true);
    const neighbor1 = first.users.find(
      (user) => user.email === 'neighbor1@dogwalk.invalid',
    )!;
    const neighbor2 = first.users.find(
      (user) => user.email === 'neighbor2@dogwalk.invalid',
    )!;
    expect(first.walkRequests).toEqual([
      expect.objectContaining({
        requesterId: demo.id,
        receiverId: neighbor1.id,
        status: 'ACCEPTED',
      }),
      expect.objectContaining({
        requesterId: neighbor2.id,
        receiverId: demo.id,
        status: 'PENDING',
      }),
    ]);
    expect(await resetDemo(prisma)).toEqual(counts);
    await expectCounts();
    expect(
      (await prisma.user.findMany({ orderBy: { id: 'asc' } })).map(
        (user) => user.id,
      ),
    ).toEqual(first.users.map((user) => user.id));
  });

  it('restores edited profiles, deleted posts and newly written data', async () => {
    await resetDemo(prisma);
    const before = await snapshot();
    const demo = before.users.find(
      (user) => user.email === 'demo@dogwalk.invalid',
    )!;
    await prisma.post.delete({ where: { id: before.posts[0].id } });
    await prisma.post.create({
      data: {
        authorId: demo.id,
        title: '새 글',
        content: '초기화 때 지워질 글',
      },
    });
    await prisma.user.update({
      where: { id: demo.id },
      data: {
        nickname: '바뀐별명',
        refreshTokenHash: 'test-refresh-hash',
        locationConsentedAt: null,
        locationUpdatedAt: null,
      },
    });
    await prisma.$executeRaw`UPDATE users SET location = NULL WHERE id = ${demo.id}`;
    await prisma.diaryImage.create({
      data: {
        diaryId: before.diaries[0].id,
        fileName: 'demo-test.jpg',
        sortOrder: 0,
      },
    });
    expect(await resetDemo(prisma)).toEqual(counts);
    await expectCounts();
    expect(
      (await prisma.post.findMany()).map((post) => post.title).sort(),
    ).toEqual(before.posts.map((post) => post.title).sort());
    expect(
      await prisma.user.findUnique({ where: { id: demo.id } }),
    ).toMatchObject({
      nickname: '둘러보기',
      refreshTokenHash: null,
      locationConsentedAt: expect.any(Date),
      locationUpdatedAt: expect.any(Date),
    });
    const [location] = await prisma.$queryRaw<
      { stored: boolean }[]
    >`SELECT location IS NOT NULL AS stored FROM users WHERE id = ${demo.id}`;
    expect(location.stored).toBe(true);
  });

  it('preserves real data and removes cross-account comments, requests and both senders’ messages', async () => {
    await resetDemo(prisma);
    const real = await createRealUser();
    const other = await createRealUser('other');
    expect(real.isDemo).toBe(false);
    const demo = await prisma.user.findUniqueOrThrow({
      where: { email: 'demo@dogwalk.invalid' },
    });
    const neighbor = await prisma.user.findUniqueOrThrow({
      where: { email: 'neighbor1@dogwalk.invalid' },
    });
    const demoPost = await prisma.post.findFirstOrThrow({
      where: { authorId: neighbor.id },
    });
    const realComment = await prisma.comment.create({
      data: {
        postId: real.posts[0].id,
        authorId: other.id,
        content: '남는 댓글',
      },
    });
    const demoComment = await prisma.comment.create({
      data: {
        postId: real.posts[0].id,
        authorId: demo.id,
        content: '지울 데모 댓글',
      },
    });
    const visitorComment = await prisma.comment.create({
      data: {
        postId: demoPost.id,
        authorId: real.id,
        content: '데모 글과 함께 지울 댓글',
      },
    });
    const realDiary = await prisma.diary.create({
      data: {
        authorId: real.id,
        dogId: real.dogs[0].id,
        walkedOn: new Date(),
        title: '남는 일기',
        content: '산책했어요',
        images: { create: { fileName: 'real-test.jpg', sortOrder: 0 } },
      },
      include: { images: true },
    });
    const realRequest = await prisma.walkRequest.create({
      data: {
        requesterId: real.id,
        receiverId: other.id,
        status: 'ACCEPTED',
        chatMessages: { create: { senderId: real.id, content: '남는 채팅' } },
      },
      include: { chatMessages: true },
    });
    const crossRequests = [];
    for (const [requesterId, receiverId] of [
      [real.id, neighbor.id],
      [neighbor.id, real.id],
    ]) {
      crossRequests.push(
        await prisma.walkRequest.create({
          data: {
            requesterId,
            receiverId,
            status: 'ACCEPTED',
            chatMessages: {
              create: [
                { senderId: real.id, content: '실제 사용자의 채팅' },
                { senderId: neighbor.id, content: '데모 이웃의 채팅' },
              ],
            },
          },
        }),
      );
    }
    await resetDemo(prisma);
    for (const user of [real, other]) {
      expect(
        await prisma.user.findUnique({
          where: { id: user.id },
          include: { dogs: true, posts: true },
        }),
      ).toEqual(user);
    }
    expect(
      await prisma.comment.findUnique({ where: { id: realComment.id } }),
    ).toEqual(realComment);
    expect(
      await prisma.comment.count({
        where: { id: { in: [demoComment.id, visitorComment.id] } },
      }),
    ).toBe(0);
    expect(
      await prisma.diary.findUnique({
        where: { id: realDiary.id },
        include: { images: true },
      }),
    ).toEqual(realDiary);
    expect(
      await prisma.walkRequest.findUnique({
        where: { id: realRequest.id },
        include: { chatMessages: true },
      }),
    ).toEqual(realRequest);
    const removedIds = crossRequests.map((entry) => entry.id);
    expect(
      await prisma.walkRequest.count({ where: { id: { in: removedIds } } }),
    ).toBe(0);
    expect(
      await prisma.chatMessage.count({
        where: { walkRequestId: { in: removedIds } },
      }),
    ).toBe(0);
  });

  it.each([false, true])(
    'rolls back an email collision with a real user (existing demo: %s)',
    async (existingDemo) => {
      if (existingDemo) {
        await resetDemo(prisma);
        await prisma.user.update({
          where: { email: 'demo@dogwalk.invalid' },
          data: { email: 'renamed-demo@dogwalk.invalid', nickname: '이전데모' },
        });
      }
      await createRealUser('email-owner', 'demo@dogwalk.invalid');
      const before = await snapshot();
      await expect(resetDemo(prisma)).rejects.toThrow(
        'Demo email belongs to a real user',
      );
      expect(await snapshot()).toEqual(before);
    },
  );

  it('rolls back earlier upserts when a later neighbor email belongs to a real user', async () => {
    await createRealUser('neighbor-owner', 'neighbor5@dogwalk.invalid');
    const before = await snapshot();
    await expect(resetDemo(prisma)).rejects.toThrow(
      'Demo email belongs to a real user',
    );
    expect(await snapshot()).toEqual(before);
  });

  it('rolls back deletions when restoring the original nickname fails', async () => {
    await resetDemo(prisma);
    await prisma.user.update({
      where: { email: 'demo@dogwalk.invalid' },
      data: { nickname: '바뀐데모' },
    });
    await createRealUser('둘러보기');
    const before = await snapshot();
    await expect(resetDemo(prisma)).rejects.toMatchObject({ code: 'P2002' });
    expect(await snapshot()).toEqual(before);
  });

  it('waits for a previously started post transaction and deletes its committed post', async () => {
    await resetDemo(prisma);
    const demo = await prisma.user.findUniqueOrThrow({
      where: { email: 'demo@dogwalk.invalid' },
    });
    const writer = new Client({ connectionString: process.env.DATABASE_URL });
    await writer.connect();
    let resetting: ReturnType<typeof resetDemo> | undefined;
    try {
      await writer.query('BEGIN');
      const {
        rows: [backend],
      } = await writer.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      await writer.query(
        'INSERT INTO posts (author_id, title, content) VALUES ($1, $2, $3)',
        [demo.id, '먼저 쓴 글', '커밋을 기다려야 하는 글'],
      );
      resetting = resetDemo(prisma);
      await vi.waitFor(
        async () => {
          const [row] = await prisma.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${backend.pid}::integer = ANY(pg_blocking_pids(pid))) AS waiting
        `;
          expect(row.waiting).toBe(true);
        },
        { timeout: 3000, interval: 20 },
      );
      await writer.query('COMMIT');
      expect(await resetting).toEqual(counts);
      expect(await prisma.post.count({ where: { title: '먼저 쓴 글' } })).toBe(
        0,
      );
      await expectCounts();
    } finally {
      await writer.query('ROLLBACK');
      await writer.end();
      await resetting?.catch(() => undefined);
    }
  });

  it('holds a new demo post until reset commits, then keeps it as a new write', async () => {
    await resetDemo(prisma);
    const demo = await prisma.user.findUniqueOrThrow({
      where: { email: 'demo@dogwalk.invalid' },
    });
    const writer = new Client({ connectionString: process.env.DATABASE_URL });
    await writer.connect();
    const { client, paused, resume } = pauseReset();
    const resetting = resetDemo(client);
    let writing: Promise<unknown> | undefined;
    try {
      await paused.promise;
      const {
        rows: [backend],
      } = await writer.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      writing = writer
        .query(
          'INSERT INTO posts (author_id, title, content) VALUES ($1, $2, $3)',
          [demo.id, '초기화 뒤 새 글', '잠금 해제 뒤 저장'],
        )
        .catch((error: unknown) => error);
      await expectBlocked(backend.pid);
      resume.resolve();
      expect(await resetting).toEqual(counts);
      expect(await writing).toMatchObject({ rowCount: 1 });
      expect(
        await prisma.post.count({
          where: { authorId: demo.id, title: '초기화 뒤 새 글' },
        }),
      ).toBe(1);
      await expectCounts(1);
    } finally {
      resume.resolve();
      await Promise.allSettled([resetting, writing]);
      await writer.end();
    }
  });

  it('locks requests before deleting chats so a real sender cannot race the single reset', async () => {
    await resetDemo(prisma);
    const real = await createRealUser();
    const neighbor = await prisma.user.findUniqueOrThrow({
      where: { email: 'neighbor1@dogwalk.invalid' },
    });
    const walk = await prisma.walkRequest.create({
      data: {
        requesterId: real.id,
        receiverId: neighbor.id,
        status: 'ACCEPTED',
        chatMessages: { create: { senderId: real.id, content: '기존 채팅' } },
      },
    });
    const writer = new Client({ connectionString: process.env.DATABASE_URL });
    await writer.connect();
    const { client, paused, resume } = pauseReset();
    const resetting = resetDemo(client);
    let writing: Promise<unknown> | undefined;
    try {
      await paused.promise;
      const {
        rows: [backend],
      } = await writer.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      writing = writer
        .query(
          'INSERT INTO chat_messages (walk_request_id, sender_id, content) VALUES ($1, $2, $3)',
          [walk.id, real.id, '삭제 사이에 보낸 채팅'],
        )
        .catch((error: unknown) => error);
      await expectBlocked(backend.pid);
      resume.resolve();
      expect(await resetting).toEqual(counts);
      expect(await writing).toMatchObject({ code: '23503' });
      expect(await prisma.walkRequest.count({ where: { id: walk.id } })).toBe(
        0,
      );
      expect(await prisma.chatMessage.count()).toBe(counts.chatMessages);
      expect(await prisma.walkRequest.count()).toBe(counts.walkRequests);
      expect(await prisma.dog.count()).toBe(counts.dogs + 1);
      expect(await prisma.post.count()).toBe(counts.posts + 1);
    } finally {
      resume.resolve();
      await Promise.allSettled([resetting, writing]);
      await writer.end();
    }
  });

  it('rejects ordinary login for all six randomly passworded demo accounts', async () => {
    await resetDemo(prisma);
    for (const user of await prisma.user.findMany()) {
      app.get(LoginLimiter).clear();
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: 'password123' })
        .expect(401);
    }
    expect(
      await prisma.user.count({ where: { refreshTokenHash: { not: null } } }),
    ).toBe(0);
  });

  it('does not accept isDemo from signup', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email: 'signup@example.com',
        password: 'password123',
        nickname: '일반가입',
        dog,
        isDemo: true,
      })
      .expect(400);
    expect(await prisma.user.count()).toBe(0);
  });

  it('stores consented grid locations within 1km of the park and demo account', async () => {
    await resetDemo(prisma);
    const rows = await prisma.$queryRaw<
      {
        lat: number;
        lng: number;
        distance: number;
        parkDistance: number;
        consented: boolean;
        updated: boolean;
      }[]
    >`
      SELECT ST_Y(u.location::geometry) AS lat, ST_X(u.location::geometry) AS lng,
        ST_Distance(u.location, me.location) AS distance,
        ST_Distance(u.location, ST_SetSRID(ST_MakePoint(126.9326, 37.5284), 4326)::geography) AS "parkDistance",
        u.location_consented_at IS NOT NULL AS consented,
        u.location_updated_at IS NOT NULL AS updated
      FROM users u, users me WHERE me.email = 'demo@dogwalk.invalid' AND u.is_demo = true
    `;
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.consented).toBe(true);
      expect(row.updated).toBe(true);
      expect(row.distance).toBeLessThan(1000);
      expect(row.parkDistance).toBeLessThan(1000);
      expect(row.lat / 0.002).toBeCloseTo(Math.round(row.lat / 0.002), 8);
      expect(row.lng / 0.002).toBeCloseTo(Math.round(row.lng / 0.002), 8);
    }
  });

  it('runs demo:reset twice with the same one-line counts and exit code zero', async () => {
    const run = promisify(execFile);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await run('npm', ['--silent', 'run', 'demo:reset'], {
        env: process.env,
        timeout: 30_000,
      });
      // npm also runs the prebuild Prisma generator; only the entrypoint emits JSON.
      const lines = result.stdout
        .trim()
        .split('\n')
        .filter((line) => line.startsWith('{'));
      expect(lines).toEqual([JSON.stringify(counts)]);
      await expectCounts();
    }
  }, 60_000);
});

describe('Demo reset entrypoint retries', () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.doUnmock('../src/demo/reset-demo.js');
    vi.doUnmock('../src/prisma/prisma.service.js');
    vi.doUnmock('node:timers/promises');
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it.each([false, true])(
    'retries once per second and disconnects (permanent failure: %s)',
    async (permanentFailure) => {
      vi.resetModules();
      process.exitCode = 0;
      const reset = vi.fn().mockRejectedValue(new Error('reset failed'));
      if (!permanentFailure)
        reset
          .mockRejectedValueOnce(new Error('first attempt failed'))
          .mockResolvedValueOnce(counts);
      const disconnect = vi.fn().mockResolvedValue(undefined);
      const sleep = vi.fn().mockResolvedValue(undefined);
      vi.doMock('../src/demo/reset-demo.js', () => ({ resetDemo: reset }));
      vi.doMock('../src/prisma/prisma.service.js', () => ({
        PrismaService: class {
          $disconnect = disconnect;
        },
      }));
      vi.doMock('node:timers/promises', () => ({ setTimeout: sleep }));
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const error = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      await import('../src/demo/reset-demo.main.js');
      expect(reset).toHaveBeenCalledTimes(permanentFailure ? 3 : 2);
      expect(sleep.mock.calls).toEqual(
        permanentFailure ? [[1000], [1000]] : [[1000]],
      );
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(permanentFailure ? 1 : 0);
      if (permanentFailure) {
        expect(error).toHaveBeenCalledOnce();
        expect(log).not.toHaveBeenCalled();
        return;
      }
      expect(log).toHaveBeenCalledExactlyOnceWith(JSON.stringify(counts));
      expect(error).not.toHaveBeenCalled();
    },
  );
});
