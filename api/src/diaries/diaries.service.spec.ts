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

const diary = { dogId: 2, walkedOn: '2026-10-20', content: '함께 걸었어요.' };

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
