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
      if (photoUrl)
        await this.removePhotoOrLog(photoUrl, 'a failed dog photo upload');
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
    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM dogs WHERE id = ${id} AND owner_id = ${userId} FOR UPDATE`;
        const current = await tx.dog.findFirst({
          where: { id, ownerId: userId },
        });
        if (!current) throw new NotFoundException('반려견을 찾을 수 없어요.');
        const updated = await tx.dog.update({
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
        return { dog: updated, previousPhotoUrl: current.photoUrl };
      });
    } catch (error) {
      if (photoUrl)
        await this.removePhotoOrLog(photoUrl, 'a failed dog photo upload');
      throw error;
    }
    if (photoUrl && result.previousPhotoUrl)
      await this.removePhotoOrLog(result.previousPhotoUrl, 'an old dog photo');
    return result.dog;
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
    if (deleted.photoUrl)
      await this.removePhotoOrLog(deleted.photoUrl, 'an old dog photo');
  }

  private async savePhoto(buffer: Buffer) {
    const converted = await convertPhoto(buffer);

    const filename = `${randomUUID()}.webp`;
    const photoUrl = `/uploads/dogs/${filename}`;
    await mkdir(this.photoDirectory, { recursive: true });
    try {
      await writeFile(join(this.photoDirectory, filename), converted);
    } catch (error) {
      await this.removePhotoOrLog(photoUrl, 'a failed dog photo upload');
      throw error;
    }
    return photoUrl;
  }

  private removePhoto(photoUrl: string) {
    return rm(join(this.photoDirectory, basename(photoUrl)), { force: true });
  }

  // A failed removal is only logged, with the file name so it can be removed
  // by hand (README). It must not replace an upload or database error, nor
  // turn an already committed change into a failed request.
  private async removePhotoOrLog(photoUrl: string, what: string) {
    try {
      await this.removePhoto(photoUrl);
    } catch {
      this.logger.error(`Could not remove ${what}: ${basename(photoUrl)}`);
    }
  }
}
