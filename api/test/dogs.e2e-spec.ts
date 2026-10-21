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
const photoMessage = 'jpg, png, webp 사진만 올릴 수 있어요.';
const missingMessage = '반려견을 찾을 수 없어요.';
const lastDogMessage = '반려견은 최소 한 마리 있어야 해요.';
const uploadDirectory = process.env.PUBLIC_UPLOAD_DIR!;
const photoDirectory = join(uploadDirectory, 'dogs');

function makeImage(width = 300, height = 200) {
  return sharp({
    create: { width, height, channels: 3, background: 'orange' },
  });
}

async function files() {
  try {
    return (await readdir(photoDirectory)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function photoPath(photoUrl: string) {
  return join(photoDirectory, basename(photoUrl));
}

describe('Dogs (e2e)', () => {
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
    jpeg = await makeImage().jpeg().toBuffer();
  });

  beforeEach(async () => {
    await prisma.chatMessage.deleteMany();
    await prisma.walkRequest.deleteMany();
    await prisma.dog.deleteMany();
    await prisma.user.deleteMany();
    await rm(uploadDirectory, { recursive: true, force: true });
  });

  afterAll(async () => {
    await app?.close();
    await rm(uploadDirectory, { recursive: true, force: true });
  });

  async function signup(suffix = 'owner') {
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
      userId: created.body.id as number,
      dog: firstDog,
    };
  }

  function create(authorization: string, photo?: Buffer) {
    const call = request(app.getHttpServer())
      .post('/api/dogs')
      .set('Authorization', authorization)
      .field('dog', JSON.stringify(dog));
    return photo
      ? call.attach('photo', photo, {
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
        })
      : call;
  }

  it('rejects all four unauthenticated APIs before any record or file is saved', async () => {
    await request(app.getHttpServer()).get('/api/dogs/me').expect(401);
    await request(app.getHttpServer())
      .post('/api/dogs')
      .field('dog', JSON.stringify(dog))
      .attach('photo', jpeg, 'photo.jpg')
      .expect(401);
    await request(app.getHttpServer())
      .patch('/api/dogs/1')
      .field('dog', JSON.stringify(dog))
      .attach('photo', jpeg, 'photo.jpg')
      .expect(401);
    await request(app.getHttpServer()).delete('/api/dogs/1').expect(401);
    expect(await prisma.dog.count()).toBe(0);
    expect(await files()).toEqual([]);
  });

  it('lists only the signup dog of the current owner without ownerId', async () => {
    const owner = await signup();
    await signup('other');
    const response = await request(app.getHttpServer())
      .get('/api/dogs/me')
      .set('Authorization', owner.authorization)
      .expect(200);
    expect(response.body).toEqual([
      {
        ...dog,
        id: owner.dog.id,
        photoUrl: null,
        createdAt: owner.dog.createdAt.toISOString(),
      },
    ]);
  });

  it('adds without a photo and orders by createdAt then id', async () => {
    const owner = await signup();
    const response = await create(owner.authorization).expect(201);
    expect(response.body).toMatchObject({ ...dog, photoUrl: null });
    expect(response.body).not.toHaveProperty('ownerId');
    await prisma.dog.updateMany({
      data: { createdAt: new Date('2020-01-01') },
    });
    const list = await request(app.getHttpServer())
      .get('/api/dogs/me')
      .set('Authorization', owner.authorization)
      .expect(200);
    expect(list.body.map((item: { id: number }) => item.id)).toEqual([
      owner.dog.id,
      response.body.id,
    ]);
    await prisma.dog.update({
      where: { id: response.body.id },
      data: { createdAt: new Date('2019-01-01') },
    });
    const reordered = await request(app.getHttpServer())
      .get('/api/dogs/me')
      .set('Authorization', owner.authorization)
      .expect(200);
    expect(reordered.body.map((item: { id: number }) => item.id)).toEqual([
      response.body.id,
      owner.dog.id,
    ]);
    expect(await files()).toEqual([]);
  });

  it.each([
    ['invalid JSON', 'not json'],
    ['null', 'null'],
    ['array', JSON.stringify([dog])],
    ...Object.keys(dog).map((field) => [
      `missing ${field}`,
      JSON.stringify(
        Object.fromEntries(
          Object.entries(dog).filter(([key]) => key !== field),
        ),
      ),
    ]),
    ['string neutered', JSON.stringify({ ...dog, neutered: 'true' })],
    ['old birth year', JSON.stringify({ ...dog, birthYear: 1989 })],
    [
      'future birth year',
      JSON.stringify({ ...dog, birthYear: new Date().getFullYear() + 1 }),
    ],
    [
      'long personality',
      JSON.stringify({ ...dog, personality: 'a'.repeat(101) }),
    ],
    ['extra field', JSON.stringify({ ...dog, ownerId: 1 })],
  ])('rejects %s without saving a photo or dog', async (_name, value) => {
    const owner = await signup();
    await request(app.getHttpServer())
      .post('/api/dogs')
      .set('Authorization', owner.authorization)
      .field('dog', value)
      .attach('photo', jpeg, 'photo.jpg')
      .expect(400);
    expect(await prisma.dog.count()).toBe(1);
    expect(await files()).toEqual([]);
  });

  it.each([{}, dog])('rejects JSON object input %j', async (value) => {
    const owner = await signup();
    await request(app.getHttpServer())
      .post('/api/dogs')
      .set('Authorization', owner.authorization)
      .send({ dog: value })
      .expect(400);
    expect(await prisma.dog.count()).toBe(1);
    expect(await files()).toEqual([]);
  });

  it('rejects missing dog, extra text fields, wrong file fields and multiple files', async () => {
    const owner = await signup();
    await request(app.getHttpServer())
      .post('/api/dogs')
      .set('Authorization', owner.authorization)
      .attach('photo', jpeg, 'photo.jpg')
      .expect(400);
    await create(owner.authorization, jpeg).field('extra', 'value').expect(400);
    await create(owner.authorization)
      .attach('wrong', jpeg, 'photo.jpg')
      .expect(400);
    await create(owner.authorization, jpeg)
      .attach('photo', jpeg, 'second.jpg')
      .expect(400);
    expect(await prisma.dog.count()).toBe(1);
    expect(await files()).toEqual([]);
  });

  it.each([
    ['jpeg', 2000, 1500, 1080, 810],
    ['jpeg', 300, 200, 300, 200],
    ['png', 300, 200, 300, 200],
    ['webp', 300, 200, 300, 200],
  ] as const)(
    'converts %s %sx%s to webp %sx%s using the actual format',
    async (format, width, height, expectedWidth, expectedHeight) => {
      const owner = await signup();
      const input = await makeImage(width, height).toFormat(format).toBuffer();
      const response = await request(app.getHttpServer())
        .post('/api/dogs')
        .set('Authorization', owner.authorization)
        .field('dog', JSON.stringify(dog))
        .attach('photo', input, {
          filename: 'untrusted.txt',
          contentType: 'text/plain',
        })
        .expect(201);
      expect(response.body.photoUrl).toMatch(
        /^\/uploads\/dogs\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/,
      );
      const metadata = await sharp(
        await readFile(photoPath(response.body.photoUrl)),
      ).metadata();
      expect(metadata).toMatchObject({
        format: 'webp',
        width: expectedWidth,
        height: expectedHeight,
      });
      expect(await files()).toEqual([basename(response.body.photoUrl)]);
    },
  );

  it('removes GPS EXIF metadata', async () => {
    const owner = await signup();
    const input = await makeImage()
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
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const response = await create(owner.authorization, input).expect(201);
    expect(
      (
        await sharp(
          await readFile(photoPath(response.body.photoUrl)),
        ).metadata()
      ).exif,
    ).toBeUndefined();
  });

  it('applies EXIF orientation before dropping metadata', async () => {
    const owner = await signup();
    const input = await makeImage(400, 200)
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    expect((await sharp(input).metadata()).orientation).toBe(6);
    const response = await create(owner.authorization, input).expect(201);
    const metadata = await sharp(
      await readFile(photoPath(response.body.photoUrl)),
    ).metadata();
    expect(metadata).toMatchObject({ width: 200, height: 400 });
    expect(metadata.orientation).toBeUndefined();
  });

  it.each(['text', 'gif', 'truncated', 'oversized'])(
    'rejects %s photos without saving files or records',
    async (kind) => {
      const owner = await signup();
      let input: Buffer = Buffer.from('not a photo');
      if (kind === 'gif') input = await makeImage().gif().toBuffer();
      if (kind === 'truncated') {
        input = jpeg.subarray(0, jpeg.length - 80);
        expect((await sharp(input).metadata()).format).toBe('jpeg');
      }
      if (kind === 'oversized') input = Buffer.alloc(5 * 1024 * 1024 + 1);
      const response = await create(owner.authorization, input).expect(
        kind === 'oversized' ? 413 : 400,
      );
      if (kind !== 'oversized')
        expect(response.body.message).toBe(photoMessage);
      expect(await prisma.dog.count()).toBe(1);
      expect(await files()).toEqual([]);
    },
  );

  it('preserves existing data and photos when a replacement is corrupt or incomplete', async () => {
    const owner = await signup();
    const created = await create(owner.authorization, jpeg).expect(201);
    const previous = await prisma.dog.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    for (const body of [
      JSON.stringify({ ...dog, name: '바뀐이름' }),
      JSON.stringify({ name: '바뀐이름' }),
    ]) {
      await request(app.getHttpServer())
        .patch(`/api/dogs/${previous.id}`)
        .set('Authorization', owner.authorization)
        .field('dog', body)
        .attach('photo', jpeg.subarray(0, jpeg.length - 80), 'broken.jpg')
        .expect(400);
    }
    expect(await prisma.dog.findUnique({ where: { id: previous.id } })).toEqual(
      previous,
    );
    expect(await files()).toEqual([basename(previous.photoUrl!)]);
  });

  it('adds a signup dog photo, replaces only that photo and preserves it on text edits', async () => {
    const owner = await signup();
    const other = await create(owner.authorization, jpeg).expect(201);
    const initial = await request(app.getHttpServer())
      .patch(`/api/dogs/${owner.dog.id}`)
      .set('Authorization', owner.authorization)
      .field('dog', JSON.stringify(dog))
      .attach('photo', jpeg, 'photo.jpg')
      .expect(200);
    const updated = await request(app.getHttpServer())
      .patch(`/api/dogs/${owner.dog.id}`)
      .set('Authorization', owner.authorization)
      .field('dog', JSON.stringify({ ...dog, name: '콩이', neutered: true }))
      .attach('photo', jpeg, 'replacement.jpg')
      .expect(200);
    expect(updated.body).toMatchObject({ name: '콩이', neutered: true });
    expect(updated.body).not.toHaveProperty('ownerId');
    expect(updated.body.photoUrl).not.toBe(initial.body.photoUrl);
    const expectedFiles = [
      basename(updated.body.photoUrl),
      basename(other.body.photoUrl),
    ].sort();
    expect(await files()).toEqual(expectedFiles);
    const withoutPhoto = await request(app.getHttpServer())
      .patch(`/api/dogs/${owner.dog.id}`)
      .set('Authorization', owner.authorization)
      .field('dog', JSON.stringify({ ...dog, breed: '믹스' }))
      .expect(200);
    expect(withoutPhoto.body).toMatchObject({
      breed: '믹스',
      photoUrl: updated.body.photoUrl,
    });
    expect(await files()).toEqual(expectedFiles);
  });

  it('returns 404 for foreign and missing ids before minimum-count checks or photo processing', async () => {
    const owner = await signup();
    const other = await signup('other');
    const foreign = await create(other.authorization, jpeg).expect(201);
    const before = await prisma.dog.findUnique({
      where: { id: foreign.body.id },
    });
    for (const id of [foreign.body.id, 2147483647]) {
      const update = await request(app.getHttpServer())
        .patch(`/api/dogs/${id}`)
        .set('Authorization', owner.authorization)
        .field('dog', JSON.stringify({ ...dog, name: '변경' }))
        .attach('photo', jpeg, 'photo.jpg')
        .expect(404);
      expect(update.body.message).toBe(missingMessage);
      const deletion = await request(app.getHttpServer())
        .delete(`/api/dogs/${id}`)
        .set('Authorization', owner.authorization)
        .expect(404);
      expect(deletion.body.message).toBe(missingMessage);
    }
    await request(app.getHttpServer())
      .patch('/api/dogs/not-a-number')
      .set('Authorization', owner.authorization)
      .field('dog', JSON.stringify(dog))
      .expect(400);
    await request(app.getHttpServer())
      .delete('/api/dogs/not-a-number')
      .set('Authorization', owner.authorization)
      .expect(400);
    expect(
      await prisma.dog.findUnique({ where: { id: foreign.body.id } }),
    ).toEqual(before);
    expect(await files()).toEqual([basename(foreign.body.photoUrl)]);
  });

  it('deletes the row and its photo but preserves the last dog and photo', async () => {
    const owner = await signup();
    const created = await create(owner.authorization, jpeg).expect(201);
    const initial = await request(app.getHttpServer())
      .patch(`/api/dogs/${owner.dog.id}`)
      .set('Authorization', owner.authorization)
      .field('dog', JSON.stringify(dog))
      .attach('photo', jpeg, 'photo.jpg')
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/dogs/${created.body.id}`)
      .set('Authorization', owner.authorization)
      .expect(204);
    expect(
      await prisma.dog.findUnique({ where: { id: created.body.id } }),
    ).toBeNull();
    const response = await request(app.getHttpServer())
      .delete(`/api/dogs/${owner.dog.id}`)
      .set('Authorization', owner.authorization)
      .expect(409);
    expect(response.body.message).toBe(lastDogMessage);
    expect(
      await prisma.dog.findUnique({ where: { id: owner.dog.id } }),
    ).toMatchObject({ photoUrl: initial.body.photoUrl });
    expect(await files()).toEqual([basename(initial.body.photoUrl)]);
  });

  it('keeps one dog when two dogs are deleted concurrently', async () => {
    const owner = await signup();
    const created = await create(owner.authorization, jpeg).expect(201);
    const responses = await Promise.all(
      [owner.dog.id, created.body.id].map((id) =>
        request(app.getHttpServer())
          .delete(`/api/dogs/${id}`)
          .set('Authorization', owner.authorization),
      ),
    );
    expect(responses.map(({ status }) => status).sort((a, b) => a - b)).toEqual(
      [204, 409],
    );
    expect(responses.find(({ status }) => status === 409)?.body.message).toBe(
      lastDogMessage,
    );
    const remaining = await prisma.dog.findMany({
      where: { ownerId: owner.userId },
    });
    expect(remaining).toHaveLength(1);
    expect(await files()).toEqual(
      remaining[0].photoUrl ? [basename(remaining[0].photoUrl)] : [],
    );
  });
});
