import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Prisma } from '../generated/prisma/client.js';
import { convertPhoto } from '../photos/convert-photo.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { DogDto } from './dto/dog.dto.js';

export const publicDogSelect = {
  id: true,
  name: true,
  breed: true,
  size: true,
  gender: true,
  neutered: true,
  birthYear: true,
  personality: true,
  photoUrl: true,
  createdAt: true,
} as const;

@Injectable()
export class DogsService {
  private readonly photoDirectory: string;
  private readonly logger = new Logger(DogsService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    const uploadDirectory = process.env.PUBLIC_UPLOAD_DIR;
    if (!uploadDirectory) throw new Error('PUBLIC_UPLOAD_DIR is required');
    this.photoDirectory = join(uploadDirectory, 'dogs');
  }

  findMine(userId: number) {
    return this.prisma.dog.findMany({
      where: { ownerId: userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: publicDogSelect,
    });
  }

  async create(userId: number, dog: DogDto, photo?: Express.Multer.File) {
    const photoUrl = photo ? await this.savePhoto(photo.buffer) : null;
    try {
      return await this.prisma.dog.create({
        data: {
          name: dog.name,
          breed: dog.breed,
          size: dog.size,
          gender: dog.gender,
          neutered: dog.neutered,
          birthYear: dog.birthYear,
          personality: dog.personality,
          ownerId: userId,
          photoUrl,
        },
        select: publicDogSelect,
      });
    } catch (error) {
      if (photoUrl) await this.discardFailedPhoto(photoUrl);
      throw error;
    }
  }

  async update(
    userId: number,
    id: number,
    dog: DogDto,
    photo?: Express.Multer.File,
  ) {
    const previous = await this.prisma.dog.findFirst({
      where: { id, ownerId: userId },
    });
    if (!previous) throw new NotFoundException('반려견을 찾을 수 없어요.');

    const photoUrl = photo ? await this.savePhoto(photo.buffer) : undefined;
    let updated;
    try {
      updated = await this.prisma.dog.update({
        where: { id },
        data: {
          name: dog.name,
          breed: dog.breed,
          size: dog.size,
          gender: dog.gender,
          neutered: dog.neutered,
          birthYear: dog.birthYear,
          personality: dog.personality,
          photoUrl,
        },
        select: publicDogSelect,
      });
    } catch (error) {
      if (photoUrl) await this.discardFailedPhoto(photoUrl);
      throw error;
    }
    if (photoUrl && previous.photoUrl)
      await this.removePhoto(previous.photoUrl);
    return updated;
  }

  async remove(userId: number, id: number) {
    const deleted = await this.prisma.$transaction(async (tx) => {
      // Serialize deletes per owner so concurrent requests cannot leave zero dogs.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const dog = await tx.dog.findFirst({ where: { id, ownerId: userId } });
      if (!dog) throw new NotFoundException('반려견을 찾을 수 없어요.');
      if ((await tx.dog.count({ where: { ownerId: userId } })) <= 1) {
        throw new ConflictException('반려견은 최소 한 마리 있어야 해요.');
      }
      try {
        return await tx.dog.delete({ where: { id } });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2003'
        ) {
          throw new ConflictException('일기를 먼저 삭제해 주세요.');
        }
        throw error;
      }
    });
    if (deleted.photoUrl) await this.removePhoto(deleted.photoUrl);
  }

  private async savePhoto(buffer: Buffer) {
    const converted = await convertPhoto(buffer);

    const filename = `${randomUUID()}.webp`;
    const photoUrl = `/uploads/dogs/${filename}`;
    await mkdir(this.photoDirectory, { recursive: true });
    try {
      await writeFile(join(this.photoDirectory, filename), converted);
    } catch (error) {
      await this.discardFailedPhoto(photoUrl);
      throw error;
    }
    return photoUrl;
  }

  private removePhoto(photoUrl: string) {
    return rm(join(this.photoDirectory, basename(photoUrl)), { force: true });
  }

  private async discardFailedPhoto(photoUrl: string) {
    // Cleanup failure must not replace the original disk or database error.
    try {
      await this.removePhoto(photoUrl);
    } catch {
      this.logger.error('Could not remove a failed dog photo upload');
    }
  }
}
