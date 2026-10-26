import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { isAfterSeoulToday } from '../diaries.service.js';
import { DiaryFormDto, UpdateDiaryFormDto } from './diary-form.dto.js';
import { DiaryDto } from './diary.dto.js';
import { ListDiariesDto } from './list-diaries.dto.js';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const diary = {
  title: '공원 산책',
  dogId: 1,
  walkedOn: '2026-10-21',
  content: ' 산책했어요. ',
};

describe('Diary multipart validation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Seoul is October 21 while UTC is still October 20.
    vi.setSystemTime(new Date('2026-10-20T15:01:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('parses a nested DiaryDto and trims content', async () => {
    const result = await pipe.transform(
      { diary: JSON.stringify(diary) },
      { type: 'body', metatype: DiaryFormDto },
    );
    expect(result.diary).toBeInstanceOf(DiaryDto);
    expect(result.diary).toEqual({ ...diary, content: '산책했어요.' });
  });

  it.each([DiaryFormDto, UpdateDiaryFormDto])(
    'trims titles before validating both create and update: %s',
    async (metatype) => {
      for (const length of [1, 50]) {
        const title = '가'.repeat(length);
        const result = await pipe.transform(
          { diary: JSON.stringify({ ...diary, title: ` \n${title}\t ` }) },
          { type: 'body', metatype },
        );
        expect(result.diary.title).toBe(title);
      }
      for (const title of [
        undefined,
        '',
        '   ',
        '가'.repeat(51),
        null,
        1,
        [],
      ]) {
        await expect(
          pipe.transform(
            { diary: JSON.stringify({ ...diary, title }) },
            { type: 'body', metatype },
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    },
  );

  // Page parsing itself is tested once on ListPostsDto (posts.dto.spec.ts);
  // this checks the shared field and the dog filter together.
  it('reads the page and the dog filter together', async () => {
    await expect(
      pipe.transform({}, { type: 'query', metatype: ListDiariesDto }),
    ).resolves.toMatchObject({ page: 1 });
    await expect(
      pipe.transform(
        { page: '2', dogId: '3' },
        { type: 'query', metatype: ListDiariesDto },
      ),
    ).resolves.toMatchObject({ page: 2, dogId: 3 });
    await expect(
      pipe.transform(
        { page: '0' },
        { type: 'query', metatype: ListDiariesDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('treats Seoul today as allowed and Seoul tomorrow as future while UTC is the previous day', () => {
    expect(isAfterSeoulToday('2026-10-21')).toBe(false);
    expect(isAfterSeoulToday('2026-10-22')).toBe(true);
  });

  it.each(['2024-02-29', '2026-01-01'])(
    'accepts real dates including leap day: %s',
    async (walkedOn) => {
      await expect(
        pipe.transform(
          { diary: JSON.stringify({ ...diary, walkedOn }) },
          { type: 'body', metatype: DiaryFormDto },
        ),
      ).resolves.toBeDefined();
    },
  );

  it.each([
    undefined,
    null,
    {},
    diary,
    'not json',
    'null',
    '[]',
    JSON.stringify([diary]),
    ...Object.keys(diary).map((field) =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(diary).filter(([key]) => key !== field),
        ),
      ),
    ),
    ...['', '   ', 'a'.repeat(2001)].map((content) =>
      JSON.stringify({ ...diary, content }),
    ),
    ...[
      '2026-02-30',
      '2025-02-29',
      '2026-13-01',
      '2026-10-00',
      '0000-01-01',
      '2026-1-01',
      '2026-10-21T00:00:00Z',
    ].map((walkedOn) => JSON.stringify({ ...diary, walkedOn })),
    ...[0, -1, 1.5, '1', null].map((dogId) =>
      JSON.stringify({ ...diary, dogId }),
    ),
    JSON.stringify({ ...diary, extra: true }),
    JSON.stringify({ ...diary, removeImageIds: [] }),
  ])('rejects invalid create input %#', async (value) => {
    await expect(
      pipe.transform(
        { diary: value },
        { type: 'body', metatype: DiaryFormDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    'a',
    null,
    [1, 1],
    ['1'],
    [1.5],
    [1, 2, 3, 4, 5, 6],
    Array.from({ length: 150_000 }, (_, index) => index + 1),
  ])('rejects invalid removal IDs %#', async (removeImageIds) => {
    await expect(
      pipe.transform(
        { diary: JSON.stringify({ ...diary, removeImageIds }) },
        { type: 'body', metatype: UpdateDiaryFormDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts the maximum trimmed length and unique integer removal IDs', async () => {
    const result = await pipe.transform(
      {
        diary: JSON.stringify({
          ...diary,
          content: ` ${'a'.repeat(2000)} `,
          removeImageIds: [1, 2],
        }),
      },
      { type: 'body', metatype: UpdateDiaryFormDto },
    );
    expect(result.diary.content).toHaveLength(2000);
    expect(result.diary.removeImageIds).toEqual([1, 2]);
  });

  it('rejects extra multipart fields', async () => {
    await expect(
      pipe.transform(
        { diary: JSON.stringify(diary), extra: 'value' },
        { type: 'body', metatype: DiaryFormDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['abc', '', '0', '-1', '1.5', ['1', '2']])(
    'rejects invalid dog filters %j',
    async (dogId) => {
      await expect(
        pipe.transform({ dogId }, { type: 'query', metatype: ListDiariesDto }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
