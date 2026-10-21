import 'reflect-metadata';
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

describe('DogsService upload failures', () => {
  const prisma = {
    dog: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  };
  let service: DogsService;
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

  beforeEach(() => {
    vi.resetAllMocks();
    service = new DogsService(prisma as unknown as PrismaService);
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
