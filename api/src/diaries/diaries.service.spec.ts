import 'reflect-metadata';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { DiariesService } from './diaries.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}));

const diary = {
  title: '공원 산책',
  dogId: 2,
  walkedOn: '2026-10-20',
  content: '함께 걸었어요.',
};

describe('DiariesService upload failures', () => {
  const prisma = {
    dog: { findFirst: vi.fn() },
    diary: { create: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  let service: DiariesService;
  let image: Express.Multer.File;

  beforeAll(async () => {
    image = {
      buffer: await sharp({
        create: { width: 20, height: 10, channels: 3, background: 'red' },
      })
        .jpeg()
        .toBuffer(),
    } as Express.Multer.File;
  });

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.dog.findFirst.mockResolvedValue({ id: 2 });
    service = new DiariesService(prisma as unknown as PrismaService);
  });

  it('requires the private upload directory at startup', () => {
    vi.stubEnv('PRIVATE_UPLOAD_DIR', '');
    try {
      expect(
        () => new DiariesService(prisma as unknown as PrismaService),
      ).toThrow('PRIVATE_UPLOAD_DIR is required');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('removes saved and partial files when the second write fails, preserving the error', async () => {
    const error = new Error('Disk full');
    vi.mocked(writeFile)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(error);
    await expect(service.create(1, diary, [image, image])).rejects.toBe(error);
    expect(mkdir).toHaveBeenCalledWith(
      join(process.env.PRIVATE_UPLOAD_DIR!, 'diaries'),
      { recursive: true },
    );
    expect(rm).toHaveBeenCalledTimes(2);
    for (const [path] of vi.mocked(writeFile).mock.calls) {
      expect(rm).toHaveBeenCalledWith(path, { force: true });
    }
    expect(prisma.diary.create).not.toHaveBeenCalled();
  });

  it('removes all new files when nested creation fails', async () => {
    const error = new Error('Database unavailable');
    prisma.diary.create.mockRejectedValueOnce(error);
    await expect(service.create(1, diary, [image, image])).rejects.toBe(error);
    expect(rm).toHaveBeenCalledTimes(2);
    for (const [path] of vi.mocked(writeFile).mock.calls) {
      expect(rm).toHaveBeenCalledWith(path, { force: true });
    }
  });

  it('tries every cleanup even if removal fails, preserving the database error', async () => {
    const error = new Error('Database unavailable');
    prisma.diary.create.mockRejectedValueOnce(error);
    vi.mocked(rm).mockRejectedValueOnce(new Error('Cleanup failed'));
    await expect(service.create(1, diary, [image, image])).rejects.toBe(error);
    expect(rm).toHaveBeenCalledTimes(2);
  });

  it('removes only new files when an update transaction fails', async () => {
    prisma.diary.findFirst.mockResolvedValueOnce({
      id: 3,
      images: [{ id: 4, fileName: 'previous.webp', sortOrder: 0 }],
    });
    const error = new Error('Transaction failed');
    prisma.$transaction.mockRejectedValueOnce(error);
    await expect(
      service.update(1, 3, { ...diary, removeImageIds: [4] }, [image, image]),
    ).rejects.toBe(error);
    expect(rm).toHaveBeenCalledTimes(2);
    for (const [path] of vi.mocked(writeFile).mock.calls) {
      expect(rm).toHaveBeenCalledWith(path, { force: true });
    }
    expect(rm).not.toHaveBeenCalledWith(
      join(process.env.PRIVATE_UPLOAD_DIR!, 'diaries', 'previous.webp'),
      { force: true },
    );
  });

  it('removes earlier files when a later image cannot be converted', async () => {
    await expect(
      service.create(1, diary, [
        image,
        { buffer: Buffer.from('not an image') } as Express.Multer.File,
      ]),
    ).rejects.toThrow('jpg, png, webp 사진만 올릴 수 있어요.');
    expect(writeFile).toHaveBeenCalledOnce();
    expect(rm).toHaveBeenCalledExactlyOnceWith(
      vi.mocked(writeFile).mock.calls[0][0],
      { force: true },
    );
    expect(prisma.diary.create).not.toHaveBeenCalled();
  });

  it('preserves directory creation failures without saving a record', async () => {
    const error = new Error('Permission denied');
    vi.mocked(mkdir).mockRejectedValueOnce(error);
    await expect(service.create(1, diary, [image])).rejects.toBe(error);
    expect(writeFile).not.toHaveBeenCalled();
    expect(prisma.diary.create).not.toHaveBeenCalled();
  });

  it('checks dog ownership before converting or writing photos', async () => {
    prisma.dog.findFirst.mockResolvedValueOnce(null);
    await expect(service.create(1, diary, [image])).rejects.toThrow(
      '내 반려견만 고를 수 있어요.',
    );
    expect(mkdir).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe('DiariesService pagination', () => {
  const selected = {
    id: 3,
    title: diary.title,
    dog: { id: diary.dogId, name: '보리' },
    walkedOn: new Date(diary.walkedOn),
    content: diary.content,
    createdAt: new Date(),
    updatedAt: new Date(),
    images: [],
  };
  let prisma: {
    diary: {
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let service: DiariesService;

  beforeEach(() => {
    prisma = {
      diary: { findMany: vi.fn(), count: vi.fn() },
      $transaction: vi.fn((queries: Promise<unknown>[]) =>
        Promise.all(queries),
      ),
    };
    service = new DiariesService(prisma as unknown as PrismaService);
  });

  it.each([undefined, 2])(
    'reads a page and count with the same owner and dog filter %s',
    async (dogId) => {
      prisma.diary.findMany.mockResolvedValue([selected]);
      prisma.diary.count.mockResolvedValue(13);
      await expect(service.findMine(1, dogId, 2)).resolves.toEqual({
        diaries: [{ ...selected, walkedOn: diary.walkedOn }],
        page: 2,
        totalPages: 3,
      });
      expect(prisma.$transaction).toHaveBeenCalledExactlyOnceWith(
        [
          prisma.diary.findMany.mock.results[0].value,
          prisma.diary.count.mock.results[0].value,
        ],
        { isolationLevel: 'RepeatableRead' },
      );
      expect(prisma.diary.findMany).toHaveBeenCalledExactlyOnceWith({
        where: { authorId: 1, dogId },
        skip: 6,
        take: 6,
        orderBy: [{ walkedOn: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          title: true,
          dog: { select: { id: true, name: true } },
          walkedOn: true,
          content: true,
          createdAt: true,
          updatedAt: true,
          images: {
            select: { id: true },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          },
        },
      });
      expect(prisma.diary.count).toHaveBeenCalledExactlyOnceWith({
        where: { authorId: 1, dogId },
      });
    },
  );

  it.each([
    [1, 0, 1],
    [3, 7, 2],
    [1e30, 7, 2],
  ])(
    'returns empty page %s with total %s and totalPages %s',
    async (page, total, totalPages) => {
      prisma.diary.findMany.mockResolvedValue([]);
      prisma.diary.count.mockResolvedValue(total);
      await expect(service.findMine(1, undefined, page)).resolves.toEqual({
        diaries: [],
        page,
        totalPages,
      });
      expect(prisma.diary.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: Math.min((page - 1) * 6, 2147483647),
          take: 6,
        }),
      );
    },
  );
});
