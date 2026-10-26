import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PostsService } from './posts.service.js';

const post = {
  id: 3,
  title: '제목',
  content: '본문',
  author: { id: 1, nickname: '작성자' },
  createdAt: new Date(),
  updatedAt: new Date(),
};
const comment = {
  id: 4,
  postId: 3,
  content: '댓글',
  author: { id: 2, nickname: '댓글 작성자' },
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PostsService', () => {
  let prisma: {
    post: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    comment: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let service: PostsService;

  beforeEach(() => {
    prisma = {
      post: {
        create: vi.fn().mockResolvedValue(post),
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(post),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      comment: {
        create: vi.fn().mockResolvedValue(comment),
        findMany: vi.fn().mockResolvedValue([comment]),
        findUnique: vi.fn().mockResolvedValue(comment),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn(async (queries: Promise<unknown>[]) =>
        Promise.all(queries),
      ),
    };
    service = new PostsService(prisma as unknown as PrismaService);
  });

  it('reads list and count in one RepeatableRead transaction, without body or author email', async () => {
    const { content: _content, ...listed } = post;
    prisma.post.findMany.mockResolvedValue([
      { ...listed, _count: { comments: 2 } },
    ]);
    prisma.post.count.mockResolvedValue(45);
    await expect(service.findAll(3)).resolves.toEqual({
      posts: [{ ...listed, commentCount: 2 }],
      page: 3,
      totalPages: 5,
    });
    expect(prisma.$transaction).toHaveBeenCalledExactlyOnceWith(
      [
        prisma.post.findMany.mock.results[0].value,
        prisma.post.count.mock.results[0].value,
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    expect(prisma.post.findMany).toHaveBeenCalledExactlyOnceWith({
      skip: 20,
      take: 10,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        title: true,
        content: false,
        author: { select: { id: true, nickname: true } },
        createdAt: true,
        updatedAt: true,
        _count: { select: { comments: true } },
      },
    });
  });

  it.each([
    [1, 0, 1],
    [6, 45, 5],
    [1e30, 45, 5],
  ])(
    'returns empty page %s with total %s and totalPages %s',
    async (page, total, totalPages) => {
      prisma.post.findMany.mockResolvedValue([]);
      prisma.post.count.mockResolvedValue(total);
      await expect(service.findAll(page)).resolves.toEqual({
        posts: [],
        page,
        totalPages,
      });
      expect(prisma.post.findMany.mock.calls[0][0].skip).toBeLessThanOrEqual(
        2147483647,
      );
    },
  );

  it('creates a post for the authenticated author and selects only public author fields', async () => {
    await expect(
      service.create(1, { title: '제목', content: '본문' }),
    ).resolves.toEqual(post);
    expect(prisma.post.create).toHaveBeenCalledWith({
      data: { authorId: 1, title: '제목', content: '본문' },
      select: expect.objectContaining({
        author: { select: { id: true, nickname: true } },
      }),
    });
  });

  it('updates with ownership in the write predicate', async () => {
    await expect(
      service.update(1, 3, { title: '새 제목', content: '새 본문' }),
    ).resolves.toEqual(post);
    expect(prisma.post.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: 3, authorId: 1 },
      data: { title: '새 제목', content: '새 본문' },
    });
  });

  it('deletes a post with ownership in the write predicate', async () => {
    await service.remove(1, 3);
    expect(prisma.post.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: 3, authorId: 1 },
    });
    expect(prisma.post.findUnique).not.toHaveBeenCalled();
    expect(prisma.comment.deleteMany).not.toHaveBeenCalled();
  });

  it.each(['update', 'remove'] as const)(
    'distinguishes missing and forbidden post %s',
    async (method) => {
      prisma.post.updateMany.mockResolvedValue({ count: 0 });
      prisma.post.deleteMany.mockResolvedValue({ count: 0 });
      const message =
        method === 'update'
          ? '내 글만 수정할 수 있어요.'
          : '내 글만 삭제할 수 있어요.';
      await expect(
        service[method](2, 3, { title: '제목', content: '본문' }),
      ).rejects.toMatchObject({ status: 403, message });
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(
        service[method](2, 3, { title: '제목', content: '본문' }),
      ).rejects.toMatchObject({ status: 404, message: '글을 찾을 수 없어요.' });
    },
  );

  it('lists comments oldest first with an id tie breaker', async () => {
    await expect(service.findComments(3)).resolves.toEqual([comment]);
    expect(prisma.comment.findMany).toHaveBeenCalledWith({
      where: { postId: 3 },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: expect.objectContaining({
        author: { select: { id: true, nickname: true } },
      }),
    });
  });

  it('does not read comments for a missing post', async () => {
    prisma.post.findUnique.mockResolvedValue(null);
    await expect(service.findComments(3)).rejects.toMatchObject({
      status: 404,
    });
    expect(prisma.comment.findMany).not.toHaveBeenCalled();
  });

  it('converts a missing or concurrently deleted post into a 404', async () => {
    prisma.comment.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Foreign key', {
        code: 'P2003',
        clientVersion: '7.10.1',
      }),
    );
    await expect(
      service.addComment(2, 3, { content: '댓글' }),
    ).rejects.toMatchObject({ status: 404, message: '글을 찾을 수 없어요.' });
  });

  it('preserves other creation errors', async () => {
    const error = new Error('Unavailable');
    prisma.comment.create.mockRejectedValue(error);
    await expect(service.addComment(2, 3, { content: '댓글' })).rejects.toBe(
      error,
    );
  });

  it('updates and deletes comments using only comment author ownership', async () => {
    await expect(
      service.updateComment(2, 4, { content: '수정' }),
    ).resolves.toEqual(comment);
    expect(prisma.comment.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: 4, authorId: 2 },
      data: { content: '수정' },
    });
    await service.removeComment(2, 4);
    expect(prisma.comment.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: 4, authorId: 2 },
    });
  });

  it.each(['updateComment', 'removeComment'] as const)(
    'distinguishes missing and forbidden comment %s',
    async (method) => {
      prisma.comment.updateMany.mockResolvedValue({ count: 0 });
      prisma.comment.deleteMany.mockResolvedValue({ count: 0 });
      const message =
        method === 'updateComment'
          ? '내 댓글만 수정할 수 있어요.'
          : '내 댓글만 삭제할 수 있어요.';
      await expect(
        service[method](1, 4, { content: '수정' }),
      ).rejects.toMatchObject({ status: 403, message });
      prisma.comment.findUnique.mockResolvedValue(null);
      await expect(
        service[method](1, 4, { content: '수정' }),
      ).rejects.toMatchObject({
        status: 404,
        message: '댓글을 찾을 수 없어요.',
      });
    },
  );
});
