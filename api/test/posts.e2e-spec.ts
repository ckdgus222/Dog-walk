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
};
const postBody = { title: '함께 걸어요', content: '산책 이야기' };
type Author = { id: number; nickname: string; authorization: string };

describe('Posts and comments (e2e)', () => {
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

  async function signup(suffix = 'author'): Promise<Author> {
    const account = {
      email: `${suffix}@example.com`,
      password: 'password123',
      nickname: suffix,
    };
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...account, dog })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: account.email, password: account.password })
      .expect(200);
    return {
      id: login.body.user.id,
      nickname: suffix,
      authorization: `Bearer ${login.body.accessToken}`,
    };
  }

  function createPost(
    author: Author,
    body: Record<string, unknown> = postBody,
  ) {
    return request(app.getHttpServer())
      .post('/api/posts')
      .set('Authorization', author.authorization)
      .send(body);
  }

  it.each([0, -1, 2147483648])(
    'rejects out of range post and comment ID %s',
    async (id) => {
      const author = await signup();
      const post = await request(app.getHttpServer())
        .get(`/api/posts/${id}`)
        .set('Authorization', author.authorization)
        .expect(400);
      const comment = await request(app.getHttpServer())
        .patch(`/api/comments/${id}`)
        .set('Authorization', author.authorization)
        .send({ content: '수정' })
        .expect(400);
      expect(post.body.message).toBe('잘못된 ID예요.');
      expect(comment.body.message).toBe('잘못된 ID예요.');
    },
  );

  it('requires login for all nine APIs', async () => {
    const routes = [
      ['post', '/api/posts'],
      ['get', '/api/posts'],
      ['get', '/api/posts/1'],
      ['patch', '/api/posts/1'],
      ['delete', '/api/posts/1'],
      ['get', '/api/posts/1/comments'],
      ['post', '/api/posts/1/comments'],
      ['patch', '/api/comments/1'],
      ['delete', '/api/comments/1'],
    ] as const;
    for (const [method, path] of routes) {
      await request(app.getHttpServer())
        [method](path)
        .send(postBody)
        .expect(401);
    }
    expect(await prisma.post.count()).toBe(0);
    expect(await prisma.comment.count()).toBe(0);
  });

  it('trims posts and exposes only the defined detail fields to other users', async () => {
    const author = await signup();
    const other = await signup('other');
    const created = await createPost(author, {
      title: ' 제목 ',
      content: '\n본문\n둘째 줄 ',
    }).expect(201);
    expect(created.body).toEqual({
      id: expect.any(Number),
      title: '제목',
      content: '본문\n둘째 줄',
      author: { id: author.id, nickname: author.nickname },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const detail = await request(app.getHttpServer())
      .get(`/api/posts/${created.body.id}`)
      .set('Authorization', other.authorization)
      .expect(200);
    expect(detail.body).toEqual(created.body);
  });

  it.each([
    {},
    { title: '제목' },
    { content: '본문' },
    { ...postBody, title: '' },
    { ...postBody, title: '   ' },
    { ...postBody, title: '가'.repeat(51) },
    { ...postBody, content: '' },
    { ...postBody, content: '   ' },
    { ...postBody, content: '가'.repeat(2001) },
    { ...postBody, authorId: 100 },
    { ...postBody, title: null },
    { ...postBody, content: 1 },
  ])('rejects invalid creation %# without saving', async (body) => {
    const author = await signup();
    await createPost(author, body).expect(400);
    expect(await prisma.post.count()).toBe(0);
  });

  it('accepts exact length boundaries after trimming', async () => {
    const author = await signup();
    for (const [title, content] of [
      ['가', '나'],
      ['가'.repeat(50), '나'.repeat(2000)],
    ]) {
      const created = await createPost(author, {
        title: ` ${title} `,
        content: ` ${content} `,
      }).expect(201);
      expect(created.body).toMatchObject({ title, content });
      const comment = await request(app.getHttpServer())
        .post(`/api/posts/${created.body.id}/comments`)
        .set('Authorization', author.authorization)
        .send({ content: ` ${'다'.repeat(300)} ` })
        .expect(201);
      expect(comment.body.content).toBe('다'.repeat(300));
    }
  });

  it('paginates 45 posts in descending date/id order and includes accurate comment counts only', async () => {
    const author = await signup();
    const posts = [];
    for (let index = 0; index < 45; index++) {
      posts.push(
        await prisma.post.create({
          data: {
            authorId: author.id,
            title: `글 ${index}`,
            content: '본문',
            createdAt: new Date(index < 20 ? '2026-01-01' : '2026-01-02'),
          },
        }),
      );
    }
    await prisma.comment.createMany({
      data: [
        { postId: posts[44].id, authorId: author.id, content: '댓글1' },
        { postId: posts[44].id, authorId: author.id, content: '댓글2' },
      ],
    });
    // Ten a page: page 3 crosses from the newer date to the older one.
    for (const [page, expected] of [
      [1, posts.slice(35).reverse()],
      [3, posts.slice(15, 25).reverse()],
      [5, posts.slice(0, 5).reverse()],
      [6, []],
    ] as const) {
      const response = await request(app.getHttpServer())
        .get(`/api/posts?page=${page}`)
        .set('Authorization', author.authorization)
        .expect(200);
      expect(response.body.page).toBe(page);
      expect(response.body.totalPages).toBe(5);
      expect(
        response.body.posts.map((post: { id: number }) => post.id),
      ).toEqual(expected.map((post) => post.id));
      for (const post of response.body.posts) {
        expect(post).toEqual({
          id: expect.any(Number),
          title: expect.any(String),
          author: { id: author.id, nickname: author.nickname },
          commentCount: post.id === posts[44].id ? 2 : 0,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        });
      }
    }
  });

  it('defaults to page one with totalPages one for an empty board', async () => {
    const author = await signup();
    const response = await request(app.getHttpServer())
      .get('/api/posts')
      .set('Authorization', author.authorization)
      .expect(200);
    expect(response.body).toEqual({ posts: [], page: 1, totalPages: 1 });
  });

  it.each(['0', '-1', '1.5', 'abc', '', '1&page=2'])(
    'rejects invalid page %s',
    async (page) => {
      const author = await signup();
      await request(app.getHttpServer())
        .get(`/api/posts?page=${page}`)
        .set('Authorization', author.authorization)
        .expect(400);
    },
  );

  it('allows only the author to update/delete a post and cascades deletion to comments', async () => {
    const author = await signup();
    const other = await signup('other');
    const created = await createPost(author).expect(201);
    const path = `/api/posts/${created.body.id}`;
    for (const method of ['patch', 'delete'] as const) {
      const denied = await request(app.getHttpServer())
        [method](path)
        .set('Authorization', other.authorization)
        .send({ title: '변경', content: '변경' })
        .expect(403);
      expect(denied.body.message).toBe(
        method === 'patch'
          ? '내 글만 수정할 수 있어요.'
          : '내 글만 삭제할 수 있어요.',
      );
      expect(
        await prisma.post.findUnique({ where: { id: created.body.id } }),
      ).toMatchObject(postBody);
    }
    for (const body of [
      { title: '변경' },
      { ...postBody, extra: true },
      { ...postBody, content: ' ' },
    ]) {
      await request(app.getHttpServer())
        .patch(path)
        .set('Authorization', author.authorization)
        .send(body)
        .expect(400);
    }
    expect(
      await prisma.post.findUnique({ where: { id: created.body.id } }),
    ).toMatchObject(postBody);
    const updated = await request(app.getHttpServer())
      .patch(path)
      .set('Authorization', author.authorization)
      .send({ title: ' 새 제목 ', content: ' 새 본문 ' })
      .expect(200);
    expect(updated.body).toMatchObject({
      title: '새 제목',
      content: '새 본문',
    });
    await request(app.getHttpServer())
      .post(`${path}/comments`)
      .set('Authorization', other.authorization)
      .send({ content: '남의 댓글' })
      .expect(201);
    await request(app.getHttpServer())
      .delete(path)
      .set('Authorization', author.authorization)
      .expect(204);
    expect(await prisma.post.count()).toBe(0);
    expect(await prisma.comment.count()).toBe(0);
  });

  it('returns 404 for missing posts and 400 for noninteger route IDs', async () => {
    const author = await signup();
    for (const [method, suffix] of [
      ['get', ''],
      ['patch', ''],
      ['delete', ''],
      ['get', '/comments'],
      ['post', '/comments'],
    ] as const) {
      const missing = await request(app.getHttpServer())
        [method](`/api/posts/2147483647${suffix}`)
        .set('Authorization', author.authorization)
        .send(suffix ? { content: '댓글' } : postBody)
        .expect(404);
      expect(missing.body.message).toBe('글을 찾을 수 없어요.');
      await request(app.getHttpServer())
        [method](`/api/posts/abc${suffix}`)
        .set('Authorization', author.authorization)
        .send(suffix ? { content: '댓글' } : postBody)
        .expect(400);
    }
  });

  it('trims comments, lists oldest first and gives control only to each comment author', async () => {
    const author = await signup();
    const other = await signup('other');
    const third = await signup('third');
    const post = await createPost(author).expect(201);
    const path = `/api/posts/${post.body.id}/comments`;
    const created = await request(app.getHttpServer())
      .post(path)
      .set('Authorization', other.authorization)
      .send({ content: ' 댓글\n내용 ' })
      .expect(201);
    expect(created.body).toEqual({
      id: expect.any(Number),
      postId: post.body.id,
      content: '댓글\n내용',
      author: { id: other.id, nickname: other.nickname },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const older = await prisma.comment.create({
      data: {
        postId: post.body.id,
        authorId: author.id,
        content: '오래된 댓글',
        createdAt: new Date('2020-01-01'),
      },
    });
    const sameDate = await prisma.comment.create({
      data: {
        postId: post.body.id,
        authorId: author.id,
        content: '같은 시각',
        createdAt: older.createdAt,
      },
    });
    const unrelated = await createPost(author).expect(201);
    await prisma.comment.create({
      data: {
        postId: unrelated.body.id,
        authorId: author.id,
        content: '다른 글 댓글',
      },
    });
    const list = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', author.authorization)
      .expect(200);
    expect(list.body.map((comment: { id: number }) => comment.id)).toEqual([
      older.id,
      sameDate.id,
      created.body.id,
    ]);
    const commentPath = `/api/comments/${created.body.id}`;
    for (const user of [author, third]) {
      for (const method of ['patch', 'delete'] as const) {
        const denied = await request(app.getHttpServer())
          [method](commentPath)
          .set('Authorization', user.authorization)
          .send({ content: '수정' })
          .expect(403);
        expect(denied.body.message).toBe(
          method === 'patch'
            ? '내 댓글만 수정할 수 있어요.'
            : '내 댓글만 삭제할 수 있어요.',
        );
      }
    }
    expect(
      await prisma.comment.findUnique({ where: { id: created.body.id } }),
    ).toMatchObject({ content: '댓글\n내용' });
    const updated = await request(app.getHttpServer())
      .patch(commentPath)
      .set('Authorization', other.authorization)
      .send({ content: ' 수정한 댓글 ' })
      .expect(200);
    expect(updated.body).toMatchObject({
      content: '수정한 댓글',
      author: { id: other.id, nickname: other.nickname },
    });
    await request(app.getHttpServer())
      .delete(commentPath)
      .set('Authorization', other.authorization)
      .expect(204);
    expect(
      await prisma.comment.findUnique({ where: { id: created.body.id } }),
    ).toBeNull();
  });

  it.each([
    {},
    { content: '' },
    { content: ' ' },
    { content: '가'.repeat(301) },
    { content: null },
    { content: 1 },
    { content: '댓글', extra: true },
  ])(
    'rejects invalid comment creation and update %# without changing data',
    async (body) => {
      const author = await signup();
      const post = await createPost(author).expect(201);
      await request(app.getHttpServer())
        .post(`/api/posts/${post.body.id}/comments`)
        .set('Authorization', author.authorization)
        .send(body)
        .expect(400);
      expect(await prisma.comment.count()).toBe(0);
      const comment = await prisma.comment.create({
        data: {
          postId: post.body.id,
          authorId: author.id,
          content: '원래 댓글',
        },
      });
      await request(app.getHttpServer())
        .patch(`/api/comments/${comment.id}`)
        .set('Authorization', author.authorization)
        .send(body)
        .expect(400);
      expect(
        await prisma.comment.findUnique({ where: { id: comment.id } }),
      ).toMatchObject({ content: '원래 댓글' });
    },
  );

  it('returns 404 for missing comments and rejects invalid comment IDs', async () => {
    const author = await signup();
    for (const method of ['patch', 'delete'] as const) {
      const missing = await request(app.getHttpServer())
        [method]('/api/comments/2147483647')
        .set('Authorization', author.authorization)
        .send({ content: '댓글' })
        .expect(404);
      expect(missing.body.message).toBe('댓글을 찾을 수 없어요.');
      await request(app.getHttpServer())
        [method]('/api/comments/abc')
        .set('Authorization', author.authorization)
        .send({ content: '댓글' })
        .expect(400);
    }
  });
});
