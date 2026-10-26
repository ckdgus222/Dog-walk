import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Prisma } from '../generated/prisma/client.js';
import { convertPhoto } from '../photos/convert-photo.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { DiaryDto, UpdateDiaryDto } from './dto/diary.dto.js';

const diarySelect = {
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
} satisfies Prisma.DiarySelect;

type SelectedDiary = Prisma.DiaryGetPayload<{ select: typeof diarySelect }>;

// Compare with today's date in Korea: the server may run in UTC, where it is
// still the previous day for nine hours after midnight in Korea.
export function isAfterSeoulToday(date: string) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return date > today;
}

function diaryResponse(diary: SelectedDiary) {
  return { ...diary, walkedOn: diary.walkedOn.toISOString().slice(0, 10) };
}

const PAGE_SIZE = 6;

@Injectable()
export class DiariesService {
  private readonly photoDirectory: string;
  private readonly logger = new Logger(DiariesService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    const directory = process.env.PRIVATE_UPLOAD_DIR;
    if (!directory) throw new Error('PRIVATE_UPLOAD_DIR is required');
    this.photoDirectory = join(directory, 'diaries');
  }

  async findMine(userId: number, dogId?: number, page = 1) {
    const where = { authorId: userId, dogId };
    const [diaries, total] = await this.prisma.$transaction(
      [
        this.prisma.diary.findMany({
          where,
          // The integer primary key bounds the number of possible rows.
          skip: Math.min((page - 1) * PAGE_SIZE, 2147483647),
          take: PAGE_SIZE,
          orderBy: [{ walkedOn: 'desc' }, { id: 'desc' }],
          select: diarySelect,
        }),
        this.prisma.diary.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      diaries: diaries.map(diaryResponse),
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  }

  async findOne(userId: number, id: number) {
    const diary = await this.prisma.diary.findFirst({
      where: { id, authorId: userId },
      select: diarySelect,
    });
    if (!diary) throw new NotFoundException('일기를 찾을 수 없어요.');
    return diaryResponse(diary);
  }

  async readImage(userId: number, id: number, imageId: number) {
    const image = await this.prisma.diaryImage.findFirst({
      where: { id: imageId, diaryId: id, diary: { authorId: userId } },
      select: { fileName: true },
    });
    if (!image) throw new NotFoundException('일기를 찾을 수 없어요.');
    try {
      return await readFile(join(this.photoDirectory, image.fileName));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException('일기를 찾을 수 없어요.');
      }
      throw error;
    }
  }

  async create(
    userId: number,
    diary: DiaryDto,
    images: Express.Multer.File[] = [],
  ) {
    this.checkWalkedOn(diary.walkedOn);
    await this.checkDog(userId, diary.dogId);
    const fileNames = await this.savePhotos(images);
    try {
      const created = await this.prisma.diary.create({
        data: {
          authorId: userId,
          dogId: diary.dogId,
          walkedOn: new Date(diary.walkedOn),
          title: diary.title,
          content: diary.content,
          images: {
            create: fileNames.map((fileName, sortOrder) => ({
              fileName,
              sortOrder,
            })),
          },
        },
        select: diarySelect,
      });
      return diaryResponse(created);
    } catch (error) {
      await this.removePhotosOrLog(fileNames, 'a failed diary photo upload');
      throw error;
    }
  }

  async update(
    userId: number,
    id: number,
    diary: UpdateDiaryDto,
    images: Express.Multer.File[] = [],
  ) {
    const previous = await this.prisma.diary.findFirst({
      where: { id, authorId: userId },
      include: { images: true },
    });
    if (!previous) throw new NotFoundException('일기를 찾을 수 없어요.');
    this.checkWalkedOn(diary.walkedOn);
    await this.checkDog(userId, diary.dogId);
    const removeImageIds = diary.removeImageIds ?? [];
    if (
      removeImageIds.some(
        (imageId) => !previous.images.some((image) => image.id === imageId),
      )
    ) {
      throw new BadRequestException('지울 사진을 찾을 수 없어요.');
    }

    const fileNames = await this.savePhotos(images);
    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        // Both update and delete lock before reading the current image list.
        await tx.$queryRaw`SELECT id FROM diaries WHERE id = ${id} FOR UPDATE`;
        const current = await tx.diary.findFirst({
          where: { id, authorId: userId },
          include: { images: true },
        });
        if (!current) throw new NotFoundException('일기를 찾을 수 없어요.');
        if (
          removeImageIds.some(
            (imageId) => !current.images.some((image) => image.id === imageId),
          )
        ) {
          throw new BadRequestException('지울 사진을 찾을 수 없어요.');
        }
        const remaining = current.images.filter(
          (image) => !removeImageIds.includes(image.id),
        );
        if (remaining.length + fileNames.length > 5) {
          throw new BadRequestException('사진은 일기 하나에 5장까지예요.');
        }
        const nextOrder =
          Math.max(-1, ...remaining.map((image) => image.sortOrder)) + 1;
        const updated = await tx.diary.update({
          where: { id },
          data: {
            dogId: diary.dogId,
            walkedOn: new Date(diary.walkedOn),
            title: diary.title,
            content: diary.content,
            images: {
              deleteMany: { id: { in: removeImageIds } },
              create: fileNames.map((fileName, index) => ({
                fileName,
                sortOrder: nextOrder + index,
              })),
            },
          },
          select: diarySelect,
        });
        return {
          diary: updated,
          removed: current.images.filter((image) =>
            removeImageIds.includes(image.id),
          ),
        };
      });
    } catch (error) {
      await this.removePhotosOrLog(fileNames, 'a failed diary photo upload');
      throw error;
    }
    await this.removePhotosOrLog(
      result.removed.map((image) => image.fileName),
      'an old diary photo',
    );
    return diaryResponse(result.diary);
  }

  async remove(userId: number, id: number) {
    const images = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM diaries WHERE id = ${id} FOR UPDATE`;
      const diary = await tx.diary.findFirst({
        where: { id, authorId: userId },
        include: { images: true },
      });
      if (!diary) throw new NotFoundException('일기를 찾을 수 없어요.');
      await tx.diary.delete({ where: { id } });
      return diary.images;
    });
    await this.removePhotosOrLog(
      images.map((image) => image.fileName),
      'an old diary photo',
    );
  }

  private checkWalkedOn(walkedOn: string) {
    if (isAfterSeoulToday(walkedOn)) {
      throw new BadRequestException('산책한 날짜는 오늘 이후일 수 없어요.');
    }
  }

  private async checkDog(userId: number, dogId: number) {
    const dog = await this.prisma.dog.findFirst({
      where: { id: dogId, ownerId: userId },
      select: { id: true },
    });
    if (!dog) throw new BadRequestException('내 반려견만 고를 수 있어요.');
  }

  private async savePhotos(images: Express.Multer.File[]) {
    const fileNames: string[] = [];
    try {
      for (const image of images) {
        const converted = await convertPhoto(image.buffer);
        await mkdir(this.photoDirectory, { recursive: true });
        const fileName = `${randomUUID()}.webp`;
        // Track the name before writing so a partially written file is removed too.
        fileNames.push(fileName);
        await writeFile(join(this.photoDirectory, fileName), converted);
      }
      return fileNames;
    } catch (error) {
      await this.removePhotosOrLog(fileNames, 'a failed diary photo upload');
      throw error;
    }
  }

  // Tries every file. A failed removal is only logged, with the file name so
  // it can be removed by hand (README). It must not replace an upload or
  // database error, nor turn an already committed change into a failed request.
  private async removePhotosOrLog(fileNames: string[], what: string) {
    for (const fileName of fileNames) {
      try {
        await rm(join(this.photoDirectory, fileName), { force: true });
      } catch {
        this.logger.error(`Could not remove ${what}: ${fileName}`);
      }
    }
  }
}
