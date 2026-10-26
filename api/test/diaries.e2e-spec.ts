import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { readdir, readFile, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import sharp from 'sharp';
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
const diary = {
  title: '공원 산책',
  walkedOn: '2020-10-20',
  content: '함께 걸었어요.',
};
const privateDirectory = process.env.PRIVATE_UPLOAD_DIR!;
const publicDirectory = process.env.PUBLIC_UPLOAD_DIR!;
const photoDirectory = join(privateDirectory, 'diaries');
const missingMessage = '일기를 찾을 수 없어요.';
const dogMessage = '내 반려견만 고를 수 있어요.';
type Owner = { authorization: string; userId: number; dogId: number };

async function files(directory = photoDirectory) {
  try {
    return (await readdir(directory, { recursive: true })).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

describe('Diaries (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jpeg: Buffer;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    jpeg = await sharp({
      create: { width: 1500, height: 1000, channels: 3, background: 'orange' },
    })
      .jpeg()
      .toBuffer();
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
    await rm(publicDirectory, { recursive: true, force: true });
    await rm(privateDirectory, { recursive: true, force: true });
  });

  afterAll(async () => {
    await app?.close();
    await rm(publicDirectory, { recursive: true, force: true });
    await rm(privateDirectory, { recursive: true, force: true });
  });

  async function signup(suffix = 'owner'): Promise<Owner> {
    const account = {
      email: `${suffix}@example.com`,
      password: 'password123',
      nickname: suffix,
    };
    const created = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...account, dog })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: account.email, password: account.password })
      .expect(200);
    const firstDog = await prisma.dog.findFirstOrThrow({
      where: { ownerId: created.body.id },
    });
    return {
      authorization: `Bearer ${login.body.accessToken}`,
      userId: created.body.id,
      dogId: firstDog.id,
    };
  }

  function create(
    owner: Owner,
    changes: Record<string, unknown> = {},
    photos: Buffer[] = [],
  ) {
    const call = request(app.getHttpServer())
      .post('/api/diaries')
      .set('Authorization', owner.authorization)
      .field(
        'diary',
        JSON.stringify({ ...diary, dogId: owner.dogId, ...changes }),
      );
    photos.forEach((photo) => call.attach('images', photo, 'photo.jpg'));
    return call;
  }

  function update(
    owner: Owner,
    id: number,
    changes: Record<string, unknown> = {},
    photos: Buffer[] = [],
  ) {
    const call = request(app.getHttpServer())
      .patch(`/api/diaries/${id}`)
      .set('Authorization', owner.authorization)
      .field(
        'diary',
        JSON.stringify({ ...diary, dogId: owner.dogId, ...changes }),
      );
    photos.forEach((photo) => call.attach('images', photo, 'photo.jpg'));
    return call;
  }

  it('requires login for all six APIs and saves nothing', async () => {
    await request(app.getHttpServer())
      .post('/api/diaries')
      .field('diary', JSON.stringify({ ...diary, dogId: 1 }))
      .attach('images', jpeg, 'photo.jpg')
      .expect(401);
    await request(app.getHttpServer()).get('/api/diaries').expect(401);
    await request(app.getHttpServer()).get('/api/diaries/1').expect(401);
    await request(app.getHttpServer())
      .get('/api/diaries/1/images/1')
      .expect(401);
    await request(app.getHttpServer())
      .patch('/api/diaries/1')
      .field('diary', JSON.stringify({ ...diary, dogId: 1 }))
      .attach('images', jpeg, 'photo.jpg')
      .expect(401);
    await request(app.getHttpServer()).delete('/api/diaries/1').expect(401);
    expect(await prisma.diary.count()).toBe(0);
    expect(await files()).toEqual([]);
  });

  it('creates without photos and returns only the defined response fields', async () => {
    const owner = await signup();
    const response = await create(owner, {
      title: ' 공원 산책 ',
      content: ' 산책했어요. ',
    }).expect(201);
    expect(response.body).toEqual({
      id: expect.any(Number),
      dog: { id: owner.dogId, name: dog.name },
      title: diary.title,
      walkedOn: diary.walkedOn,
      content: '산책했어요.',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      images: [],
    });
    expect(await files()).toEqual([]);
  });

  it('stores two converted images privately, removes GPS metadata, and hides filenames', async () => {
    const owner = await signup();
    const gps = await sharp(jpeg)
      .withExif({
        IFD3: {
          GPSLatitudeRef: 'N',
          GPSLatitude: '37/1 30/1 0/1',
          GPSLongitudeRef: 'E',
          GPSLongitude: '127/1 0/1 0/1',
        },
      })
      .jpeg()
      .toBuffer();
    expect((await sharp(gps).metadata()).exif).toBeDefined();
    const response = await create(owner, {}, [gps, jpeg]).expect(201);
    const images = await prisma.diaryImage.findMany({
      where: { diaryId: response.body.id },
      orderBy: { sortOrder: 'asc' },
    });
    expect(response.body.images).toEqual(images.map(({ id }) => ({ id })));
    expect(images.map(({ sortOrder }) => sortOrder)).toEqual([0, 1]);
    expect(await files()).toEqual(
      images.map(({ fileName }) => fileName).sort(),
    );
    expect(await files(publicDirectory)).toEqual([]);
    for (const image of images) {
      expect(image.fileName).toMatch(/^[0-9a-f-]{36}\.webp$/);
      const metadata = await sharp(
        await readFile(join(photoDirectory, image.fileName)),
      ).metadata();
      expect(metadata).toMatchObject({
        format: 'webp',
        width: 1080,
        height: 720,
      });
      expect(metadata.exif).toBeUndefined();
    }
  });

  it.each([
    { title: undefined },
    { title: '' },
    { title: '   ' },
    { title: '가'.repeat(51) },
    { content: '' },
    { content: '   ' },
    { content: 'a'.repeat(2001) },
    { walkedOn: '2020/10/20' },
    { walkedOn: '2020-02-30' },
    { extra: true },
    { dogId: 0 },
    { dogId: '1' },
    { removeImageIds: [] },
  ])(
    'rejects invalid creation %# without records or files',
    async (changes) => {
      const owner = await signup();
      await create(owner, changes, [jpeg]).expect(400);
      expect(await prisma.diary.count()).toBe(0);
      expect(await prisma.diaryImage.count()).toBe(0);
      expect(await files()).toEqual([]);
    },
  );

  it('rejects tomorrow in Seoul without saving files', async () => {
    const owner = await signup();
    const tomorrow = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(Date.now() + 86400000));
    const response = await create(owner, { walkedOn: tomorrow }, [jpeg]).expect(
      400,
    );
    expect(response.body.message).toContain(
      '산책한 날짜는 오늘 이후일 수 없어요.',
    );
    expect(await prisma.diary.count()).toBe(0);
    expect(await files()).toEqual([]);
  });

  it.each(['not json', 'null', '[]'])(
    'rejects malformed multipart diary %s',
    async (value) => {
      const owner = await signup();
      await request(app.getHttpServer())
        .post('/api/diaries')
        .set('Authorization', owner.authorization)
        .field('diary', value)
        .attach('images', jpeg, 'photo.jpg')
        .expect(400);
      expect(await prisma.diary.count()).toBe(0);
      expect(await files()).toEqual([]);
    },
  );

  it('rejects absent diary, object input, unknown fields and foreign dogs before writing', async () => {
    const owner = await signup();
    const other = await signup('other');
    await request(app.getHttpServer())
      .post('/api/diaries')
      .set('Authorization', owner.authorization)
      .attach('images', jpeg, 'photo.jpg')
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/diaries')
      .set('Authorization', owner.authorization)
      .send({ diary: { ...diary, dogId: owner.dogId } })
      .expect(400);
    await create(owner, {}, [jpeg]).field('extra', 'value').expect(400);
    await create(owner).attach('wrong', jpeg, 'photo.jpg').expect(400);
    const foreign = await create(owner, { dogId: other.dogId }, [jpeg]).expect(
      400,
    );
    expect(foreign.body.message).toBe(dogMessage);
    expect(await prisma.diary.count()).toBe(0);
    expect(await files()).toEqual([]);
  });

  it('rejects six images, oversized images and text disguised as an image without leftovers', async () => {
    const owner = await signup();
    await create(owner, {}, Array<Buffer>(6).fill(jpeg)).expect(400);
    await create(owner, {}, [Buffer.alloc(5 * 1024 * 1024 + 1)]).expect(413);
    // Conversion of the second file fails after the first has already been saved.
    await create(owner, {}, [jpeg, Buffer.from('not a photo')]).expect(400);
    expect(await prisma.diary.count()).toBe(0);
    expect(await prisma.diaryImage.count()).toBe(0);
    expect(await files()).toEqual([]);
  });

  it('lists only mine by date then id descending, with an optional dog filter', async () => {
    const owner = await signup();
    const other = await signup('other');
    const secondDog = await prisma.dog.create({
      data: { ...dog, size: 'SMALL', gender: 'FEMALE', ownerId: owner.userId },
    });
    const older = await create(owner).expect(201);
    const newer = await create(owner, {
      dogId: secondDog.id,
      walkedOn: '2020-10-21',
    }).expect(201);
    const latest = await create(owner, { walkedOn: '2020-10-21' }).expect(201);
    await create(other).expect(201);
    const list = await request(app.getHttpServer())
      .get('/api/diaries')
      .set('Authorization', owner.authorization)
      .expect(200);
    expect(list.body).toEqual({
      diaries: [latest.body, newer.body, older.body],
      page: 1,
      totalPages: 1,
    });
    const filtered = await request(app.getHttpServer())
      .get(`/api/diaries?dogId=${owner.dogId}`)
      .set('Authorization', owner.authorization)
      .expect(200);
    expect(filtered.body).toEqual({
      diaries: [latest.body, older.body],
      page: 1,
      totalPages: 1,
    });
    const foreign = await request(app.getHttpServer())
      .get(`/api/diaries?dogId=${other.dogId}`)
      .set('Authorization', owner.authorization)
      .expect(200);
    expect(foreign.body).toEqual({ diaries: [], page: 1, totalPages: 1 });
    for (const filter of ['abc', '0', '-1', '1.5']) {
      await request(app.getHttpServer())
        .get(`/api/diaries?dogId=${filter}`)
        .set('Authorization', owner.authorization)
        .expect(400);
    }
  });

  it('paginates seven diaries with stable date and id order, including empty and huge pages', async () => {
    const owner = await signup();
    const other = await signup('other');
    const secondDog = await prisma.dog.create({
      data: { ...dog, size: 'SMALL', gender: 'FEMALE', ownerId: owner.userId },
    });
    const diaries = [];
    for (let index = 0; index < 7; index++) {
      const created = await create(owner, {
        title: `산책 ${index + 1}`,
        walkedOn: '2020-10-21',
      }).expect(201);
      diaries.push(created.body);
    }
    await create(owner, { dogId: secondDog.id }).expect(201);
    await create(other).expect(201);
    for (const [page, expected] of [
      ['1', diaries.slice(1).reverse()],
      ['2', diaries.slice(0, 1)],
      ['3', []],
      ['1000000000000000000000000000000', []],
    ] as const) {
      const response = await request(app.getHttpServer())
        .get(`/api/diaries?dogId=${owner.dogId}&page=${page}`)
        .set('Authorization', owner.authorization)
        .expect(200);
      expect(response.body).toEqual({
        diaries: expected,
        page: Number(page),
        totalPages: 2,
      });
    }
    for (const page of [
      '0',
      '-1',
      '1.5',
      'abc',
      '',
      '1e2',
      'Infinity',
      '1&page=2',
    ]) {
      await request(app.getHttpServer())
        .get(`/api/diaries?page=${page}`)
        .set('Authorization', owner.authorization)
        .expect(400);
    }
  });

  it('rejects invalid title updates without changing the diary or photos', async () => {
    const owner = await signup();
    const created = await create(owner, {}, [jpeg]).expect(201);
    const beforeFiles = await files();
    for (const title of [undefined, '', '   ', '가'.repeat(51)]) {
      await update(owner, created.body.id, { title }, [jpeg]).expect(400);
      const detail = await request(app.getHttpServer())
        .get(`/api/diaries/${created.body.id}`)
        .set('Authorization', owner.authorization)
        .expect(200);
      expect(detail.body).toEqual(created.body);
      expect(await files()).toEqual(beforeFiles);
    }
  });

  it('returns details and private images only to their author with no-store headers', async () => {
    const owner = await signup();
    const other = await signup('other');
    const created = await create(owner, {}, [jpeg]).expect(201);
    const another = await create(owner, {}, [jpeg]).expect(201);
    const id = created.body.id as number;
    const imageId = created.body.images[0].id as number;
    const detail = await request(app.getHttpServer())
      .get(`/api/diaries/${id}`)
      .set('Authorization', owner.authorization)
      .expect(200);
    expect(detail.body).toEqual(created.body);
    for (const [authorization, diaryId] of [
      [other.authorization, id],
      [owner.authorization, 2147483647],
    ] as const) {
      const missing = await request(app.getHttpServer())
        .get(`/api/diaries/${diaryId}`)
        .set('Authorization', authorization)
        .expect(404);
      expect(missing.body.message).toBe(missingMessage);
    }
    const photo = await request(app.getHttpServer())
      .get(`/api/diaries/${id}/images/${imageId}`)
      .set('Authorization', owner.authorization)
      .expect(200);
    expect(photo.headers['content-type']).toBe('image/webp');
    expect(photo.headers['cache-control']).toBe('no-store');
    expect(photo.headers['x-content-type-options']).toBe('nosniff');
    expect((await sharp(photo.body as Buffer).metadata()).format).toBe('webp');
    const foreign = await request(app.getHttpServer())
      .get(`/api/diaries/${id}/images/${imageId}`)
      .set('Authorization', other.authorization)
      .expect(404);
    expect(foreign.body.message).toBe(missingMessage);
    await request(app.getHttpServer())
      .get(`/api/diaries/${id}/images/${imageId}`)
      .expect(401);
    const mismatch = await request(app.getHttpServer())
      .get(`/api/diaries/${id}/images/${another.body.images[0].id}`)
      .set('Authorization', owner.authorization)
      .expect(404);
    expect(mismatch.body.message).toBe(missingMessage);
    await request(app.getHttpServer())
      .get('/api/diaries/not-an-id')
      .set('Authorization', owner.authorization)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/diaries/${id}/images/not-an-id`)
      .set('Authorization', owner.authorization)
      .expect(400);
  });

  it('updates text, date and dog, deletes one photo, and appends two in order', async () => {
    const owner = await signup();
    const secondDog = await prisma.dog.create({
      data: {
        ...dog,
        size: 'SMALL',
        gender: 'FEMALE',
        name: '두부',
        ownerId: owner.userId,
      },
    });
    const created = await create(owner, {}, [jpeg, jpeg]).expect(201);
    const previous = await prisma.diaryImage.findMany({
      where: { diaryId: created.body.id },
      orderBy: { sortOrder: 'asc' },
    });
    const response = await update(
      owner,
      created.body.id,
      {
        dogId: secondDog.id,
        walkedOn: '2020-10-19',
        title: ' 바뀐 산책 제목 ',
        content: ' 새 산책 기록 ',
        removeImageIds: [previous[0].id],
      },
      [jpeg, jpeg],
    ).expect(200);
    expect(response.body).toMatchObject({
      dog: { id: secondDog.id, name: '두부' },
      walkedOn: '2020-10-19',
      title: '바뀐 산책 제목',
      content: '새 산책 기록',
    });
    const current = await prisma.diaryImage.findMany({
      where: { diaryId: created.body.id },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    expect(current.map(({ sortOrder }) => sortOrder)).toEqual([1, 2, 3]);
    expect(response.body.images).toEqual(current.map(({ id }) => ({ id })));
    expect(current[0].id).toBe(previous[1].id);
    expect(await files()).toEqual(
      current.map(({ fileName }) => fileName).sort(),
    );
    await expect(
      readFile(join(photoDirectory, previous[0].fileName)),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects foreign removal IDs, duplicate IDs, foreign dogs and unauthorized edits without changing records or files', async () => {
    const owner = await signup();
    const other = await signup('other');
    const created = await create(owner, {}, [jpeg, jpeg]).expect(201);
    const another = await create(owner, {}, [jpeg]).expect(201);
    const previous = await prisma.diary.findMany({
      include: { images: true },
      orderBy: { id: 'asc' },
    });
    const beforeFiles = await files();
    const wrongPhoto = await update(
      owner,
      created.body.id,
      { removeImageIds: [another.body.images[0].id] },
      [jpeg],
    ).expect(400);
    expect(wrongPhoto.body.message).toBe('지울 사진을 찾을 수 없어요.');
    await update(
      owner,
      created.body.id,
      {
        removeImageIds: [created.body.images[0].id, created.body.images[0].id],
      },
      [jpeg],
    ).expect(400);
    const wrongDog = await update(
      owner,
      created.body.id,
      { dogId: other.dogId },
      [jpeg],
    ).expect(400);
    expect(wrongDog.body.message).toBe(dogMessage);
    const foreign = await update(other, created.body.id, {}, [jpeg]).expect(
      404,
    );
    expect(foreign.body.message).toBe(missingMessage);
    await update(owner, 2147483647, {}, [jpeg]).expect(404);
    expect(
      await prisma.diary.findMany({
        include: { images: true },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(previous);
    expect(await files()).toEqual(beforeFiles);
  });

  it('rejects an update resulting in six photos and removes its new uploads', async () => {
    const owner = await signup();
    const created = await create(owner, {}, Array<Buffer>(5).fill(jpeg)).expect(
      201,
    );
    const previousFiles = await files();
    const response = await update(
      owner,
      created.body.id,
      { content: '저장되지 않을 글' },
      [jpeg],
    ).expect(400);
    expect(response.body.message).toBe('사진은 일기 하나에 5장까지예요.');
    expect(await files()).toEqual(previousFiles);
    const detail = await request(app.getHttpServer())
      .get(`/api/diaries/${created.body.id}`)
      .set('Authorization', owner.authorization)
      .expect(200);
    expect(detail.body).toEqual(created.body);
  });

  it('serializes simultaneous additions so only one succeeds and exactly five files remain', async () => {
    const owner = await signup();
    const created = await create(owner, {}, Array<Buffer>(4).fill(jpeg)).expect(
      201,
    );
    const results = await Promise.all([
      update(owner, created.body.id, {}, [jpeg]),
      update(owner, created.body.id, {}, [jpeg]),
    ]);
    expect(results.map(({ status }) => status).sort((a, b) => a - b)).toEqual([
      200, 400,
    ]);
    expect(results.find(({ status }) => status === 400)!.body.message).toBe(
      '사진은 일기 하나에 5장까지예요.',
    );
    const images = await prisma.diaryImage.findMany({
      where: { diaryId: created.body.id },
    });
    expect(images).toHaveLength(5);
    expect(await files()).toEqual(
      images.map(({ fileName }) => fileName).sort(),
    );
  });

  it('rejects another author deleting the diary, then deletes its rows and files for the owner', async () => {
    const owner = await signup();
    const other = await signup('other');
    const created = await create(owner, {}, [jpeg, jpeg]).expect(201);
    const previousFiles = await files();
    const foreign = await request(app.getHttpServer())
      .delete(`/api/diaries/${created.body.id}`)
      .set('Authorization', other.authorization)
      .expect(404);
    expect(foreign.body.message).toBe(missingMessage);
    expect(await files()).toEqual(previousFiles);
    expect(await prisma.diary.count()).toBe(1);
    await request(app.getHttpServer())
      .delete(`/api/diaries/${created.body.id}`)
      .set('Authorization', owner.authorization)
      .expect(204);
    expect(await prisma.diary.count()).toBe(0);
    expect(await prisma.diaryImage.count()).toBe(0);
    expect(await files()).toEqual([]);
  });

  it('leaves no orphaned files when addition and deletion run concurrently', async () => {
    const owner = await signup();
    const created = await create(owner, {}, [jpeg, jpeg]).expect(201);
    const [edited, deleted] = await Promise.all([
      update(owner, created.body.id, {}, [jpeg]),
      request(app.getHttpServer())
        .delete(`/api/diaries/${created.body.id}`)
        .set('Authorization', owner.authorization),
    ]);
    expect([200, 404]).toContain(edited.status);
    expect(deleted.status).toBe(204);
    expect(await prisma.diary.count()).toBe(0);
    expect(await prisma.diaryImage.count()).toBe(0);
    expect(await files()).toEqual([]);
  });

  it('keeps a dog and its photo until its diary is deleted', async () => {
    const owner = await signup();
    const secondDog = await request(app.getHttpServer())
      .post('/api/dogs')
      .set('Authorization', owner.authorization)
      .field('dog', JSON.stringify({ ...dog, name: '두부' }))
      .attach('photo', jpeg, 'photo.jpg')
      .expect(201);
    const dogPath = join(
      publicDirectory,
      'dogs',
      basename(secondDog.body.photoUrl),
    );
    const originalPhoto = await readFile(dogPath);
    const created = await create(owner, { dogId: secondDog.body.id }, [
      jpeg,
    ]).expect(201);
    const response = await request(app.getHttpServer())
      .delete(`/api/dogs/${secondDog.body.id}`)
      .set('Authorization', owner.authorization)
      .expect(409);
    expect(response.body.message).toBe('일기를 먼저 삭제해 주세요.');
    expect(await prisma.dog.count()).toBe(2);
    expect(await readFile(dogPath)).toEqual(originalPhoto);
    await request(app.getHttpServer())
      .delete(`/api/diaries/${created.body.id}`)
      .set('Authorization', owner.authorization)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/api/dogs/${secondDog.body.id}`)
      .set('Authorization', owner.authorization)
      .expect(204);
    expect(await prisma.dog.count()).toBe(1);
    await expect(readFile(dogPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
