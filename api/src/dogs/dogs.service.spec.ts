import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import { DogsService } from './dogs.service.js';
import type { DogDto } from './dto/dog.dto.js';
import type { PrismaService } from '../prisma/prisma.service.js';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}));

const dog: DogDto = {
  name: '보리',
  breed: '푸들',
  size: 'SMALL',
  gender: 'FEMALE',
  neutered: false,
  birthYear: 2020,
  personality: '산책을 좋아해요',
};

let photo: Express.Multer.File;

beforeAll(async () => {
  photo = {
    buffer: await sharp({
      create: { width: 20, height: 10, channels: 3, background: 'red' },
    })
      .jpeg()
      .toBuffer(),
  } as Express.Multer.File;
});

describe('DogsService upload failures', () => {
  const prisma = {
    dog: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  const tx = {
    $queryRaw: vi.fn(),
    dog: {
      findFirst: vi.fn(),
      // Reuse the mock so existing update failure setups also apply inside transactions.
      update: prisma.dog.update,
      count: vi.fn(),
      delete: vi.fn(),
    },
  };
  let service: DogsService;

  beforeEach(() => {
    vi.resetAllMocks();
    tx.dog.findFirst.mockResolvedValue({
      id: 2,
      photoUrl: '/uploads/dogs/previous.webp',
    });
    prisma.$transaction.mockImplementation((callback) => callback(tx));
    service = new DogsService(prisma as unknown as PrismaService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns the saved dog and logs only the old filename when removal fails', async () => {
    prisma.dog.findFirst.mockResolvedValue({ id: 2 });
    tx.dog.update.mockImplementation(({ data }) => ({ id: 2, ...data }));
    vi.mocked(rm).mockRejectedValueOnce(new Error('Private disk error'));
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    const updated = await service.update(1, 2, dog, photo);

    expect(updated).toMatchObject({ id: 2, name: dog.name });
    expect(updated.photoUrl).toBe(
      `/uploads/dogs/${basename(vi.mocked(writeFile).mock.calls[0][0] as string)}`,
    );
    expect(rm).toHaveBeenCalledExactlyOnceWith(
      join(process.env.PUBLIC_UPLOAD_DIR!, 'dogs', 'previous.webp'),
      { force: true },
    );
    expect(log).toHaveBeenCalledExactlyOnceWith(
      'Could not remove an old dog photo: previous.webp',
    );
  });

  it('succeeds after deleting the dog even if its photo removal fails', async () => {
    tx.dog.count.mockResolvedValue(2);
    tx.dog.delete.mockResolvedValue({
      id: 2,
      photoUrl: '/uploads/dogs/previous.webp',
    });
    vi.mocked(rm).mockRejectedValueOnce(new Error('Private disk error'));
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    await expect(service.remove(1, 2)).resolves.toBeUndefined();

    expect(tx.dog.delete).toHaveBeenCalledExactlyOnceWith({ where: { id: 2 } });
    expect(log).toHaveBeenCalledExactlyOnceWith(
      'Could not remove an old dog photo: previous.webp',
    );
  });

  it('requires the upload directory at startup', () => {
    vi.stubEnv('PUBLIC_UPLOAD_DIR', '');
    try {
      expect(() => new DogsService(prisma as unknown as PrismaService)).toThrow(
        'PUBLIC_UPLOAD_DIR is required',
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('removes a partial file and preserves the disk error without saving to the database', async () => {
    const error = new Error('Disk full');
    vi.mocked(writeFile).mockRejectedValueOnce(error);
    await expect(service.create(1, dog, photo)).rejects.toBe(error);
    expect(mkdir).toHaveBeenCalledWith(
      join(process.env.PUBLIC_UPLOAD_DIR!, 'dogs'),
      { recursive: true },
    );
    expect(rm).toHaveBeenCalledWith(vi.mocked(writeFile).mock.calls[0][0], {
      force: true,
    });
    expect(prisma.dog.create).not.toHaveBeenCalled();
  });

  it('removes the new photo when creating the database record fails', async () => {
    const error = new Error('Database unavailable');
    prisma.dog.create.mockRejectedValueOnce(error);
    await expect(service.create(1, dog, photo)).rejects.toBe(error);
    expect(rm).toHaveBeenCalledExactlyOnceWith(
      vi.mocked(writeFile).mock.calls[0][0],
      { force: true },
    );
  });

  it('removes only the new photo when updating the database record fails', async () => {
    const error = new Error('Database unavailable');
    prisma.dog.findFirst.mockResolvedValueOnce({
      id: 2,
      photoUrl: '/uploads/dogs/previous.webp',
    });
    prisma.dog.update.mockRejectedValueOnce(error);
    await expect(service.update(1, 2, dog, photo)).rejects.toBe(error);
    const savedPath = vi.mocked(writeFile).mock.calls[0][0] as string;
    expect(basename(savedPath)).not.toBe('previous.webp');
    expect(rm).toHaveBeenCalledExactlyOnceWith(savedPath, { force: true });
  });

  it('does not replace a database error when cleanup also fails', async () => {
    const error = new Error('Database unavailable');
    prisma.dog.create.mockRejectedValueOnce(error);
    vi.mocked(rm).mockRejectedValueOnce(new Error('Cleanup failed'));
    await expect(service.create(1, dog, photo)).rejects.toBe(error);
    expect(rm).toHaveBeenCalledOnce();
  });

  it('keeps directory creation failures as server errors', async () => {
    const error = new Error('Permission denied');
    vi.mocked(mkdir).mockRejectedValueOnce(error);
    await expect(service.create(1, dog, photo)).rejects.toBe(error);
    expect(writeFile).not.toHaveBeenCalled();
    expect(prisma.dog.create).not.toHaveBeenCalled();
  });
});

describe('DogsService concurrent photo changes', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    {
      firstAction: 'update',
      secondAction: 'update',
      expectedSecondResult: { status: 'fulfilled' },
      expectedWriteCount: 2,
      remainingUploadIndexes: [1],
    },
    {
      firstAction: 'remove',
      secondAction: 'update',
      expectedSecondResult: {
        status: 'rejected',
        reason: { status: 404, message: '반려견을 찾을 수 없어요.' },
      },
      expectedWriteCount: 1,
      remainingUploadIndexes: [],
    },
    {
      firstAction: 'update',
      secondAction: 'remove',
      expectedSecondResult: { status: 'fulfilled' },
      expectedWriteCount: 1,
      remainingUploadIndexes: [],
    },
  ] as const)(
    'cleans up photos when $firstAction commits before $secondAction',
    async ({
      firstAction,
      secondAction,
      expectedSecondResult,
      expectedWriteCount,
      remainingUploadIndexes,
    }) => {
      vi.resetAllMocks();
      const directory = join(process.env.PUBLIC_UPLOAD_DIR!, 'dogs');
      let row: { id: number; photoUrl: string } | null = {
        id: 2,
        photoUrl: '/uploads/dogs/previous.webp',
      };
      const files = new Set([join(directory, 'previous.webp')]);
      vi.mocked(writeFile).mockImplementation(async (path) => {
        files.add(path as string);
      });
      vi.mocked(rm).mockImplementation(async (path) => {
        files.delete(path as string);
      });
      let firstWriteReached!: () => void;
      const firstWrite = new Promise<void>((resolve) => {
        firstWriteReached = resolve;
      });
      let releaseFirst!: () => void;
      const firstMayCommit = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      let secondStarted!: () => void;
      const secondTransaction = new Promise<void>((resolve) => {
        secondStarted = resolve;
      });
      let dogLock = Promise.resolve();
      let transactionCount = 0;
      const lockQueries = vi.fn();
      const prisma = {
        dog: { findFirst: vi.fn(async () => (row ? { ...row } : null)) },
        $transaction: vi.fn(
          async (callback: (tx: unknown) => Promise<unknown>) => {
            const index = transactionCount++;
            let unlock: (() => void) | undefined;
            const holdFirstWrite = async () => {
              if (index !== 0) return;
              firstWriteReached();
              await firstMayCommit;
            };
            // UPDATE and DELETE also take the row lock until commit in PostgreSQL.
            const acquireDogLock = async () => {
              if (unlock) return;
              const previousLock = dogLock;
              dogLock = new Promise<void>((resolve) => {
                unlock = resolve;
              });
              await previousLock;
            };
            const tx = {
              $queryRaw: async (
                sql: TemplateStringsArray,
                ...values: number[]
              ) => {
                if (!sql.join('?').includes('FROM dogs')) return [];
                lockQueries(sql.join('?'), values);
                await acquireDogLock();
                return row ? [{ id: row.id }] : [];
              },
              dog: {
                findFirst: async () => (row ? { ...row } : null),
                count: async () => 2,
                update: async ({ data }: { data: { photoUrl: string } }) => {
                  await acquireDogLock();
                  if (!row) throw new Error('Record not found');
                  await holdFirstWrite();
                  row = { id: 2, photoUrl: data.photoUrl };
                  return { ...row };
                },
                delete: async () => {
                  await acquireDogLock();
                  await holdFirstWrite();
                  const deleted = row;
                  row = null;
                  return deleted;
                },
              },
            };
            if (index === 1) secondStarted();
            try {
              return await callback(tx);
            } finally {
              unlock?.();
            }
          },
        ),
      };
      const service = new DogsService(prisma as unknown as PrismaService);
      const first =
        firstAction === 'update'
          ? service.update(1, 2, dog, photo)
          : service.remove(1, 2);
      await firstWrite;
      const second =
        secondAction === 'update'
          ? service.update(1, 2, dog, photo)
          : service.remove(1, 2);
      const results = Promise.allSettled([first, second]);
      await secondTransaction;
      releaseFirst();
      const [firstResult, secondResult] = await results;
      const expectedFiles = remainingUploadIndexes.map(
        (index) => vi.mocked(writeFile).mock.calls[index][0] as string,
      );
      const expectedRows = expectedFiles.map((path) => ({
        id: 2,
        photoUrl: `/uploads/dogs/${basename(path)}`,
      }));

      expect(firstResult.status).toBe('fulfilled');
      expect(secondResult).toMatchObject(expectedSecondResult);
      expect(writeFile).toHaveBeenCalledTimes(expectedWriteCount);
      expect(row).toEqual(expectedRows[0] ?? null);
      expect([...files]).toEqual(expectedFiles);
      expect(lockQueries).toHaveBeenCalledTimes(expectedWriteCount);
      expect(lockQueries).toHaveBeenCalledWith(
        'SELECT id FROM dogs WHERE id = ? AND owner_id = ? FOR UPDATE',
        [2, 1],
      );
    },
  );
});
