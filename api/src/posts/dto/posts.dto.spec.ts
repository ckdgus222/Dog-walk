import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { PostDto } from './post.dto.js';
import { CommentDto } from './comment.dto.js';
import { ListPostsDto } from './list-posts.dto.js';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

describe('Post DTO validation', () => {
  it.each([
    {},
    { title: '제목' },
    { content: '본문' },
    { title: '', content: '본문' },
    { title: '   ', content: '본문' },
    { title: 'a'.repeat(51), content: '본문' },
    { title: '제목', content: '' },
    { title: '제목', content: '   ' },
    { title: '제목', content: 'a'.repeat(2001) },
    { title: null, content: '본문' },
    { title: 1, content: '본문' },
    { title: [], content: '본문' },
    { title: '제목', content: null },
    { title: '제목', content: 1 },
    { title: '제목', content: ['본문'] },
    { title: '제목', content: '본문', authorId: 1 },
  ])('rejects invalid post %#', async (body) => {
    await expect(
      pipe.transform(body, { type: 'body', metatype: PostDto }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it.each([1, 50])(
    'trims a title of length %i before validation',
    async (length) => {
      const title = '가'.repeat(length);
      const content = '나'.repeat(2000);
      await expect(
        pipe.transform(
          { title: ` ${title} `, content: `\n${content}\n` },
          {
            type: 'body',
            metatype: PostDto,
          },
        ),
      ).resolves.toMatchObject({ title, content });
    },
  );

  it.each([
    {},
    { content: '' },
    { content: '   ' },
    { content: 'a'.repeat(301) },
    { content: null },
    { content: 10 },
    { content: ['댓글'] },
    { content: '댓글', postId: 1 },
  ])('rejects invalid comment %#', async (body) => {
    await expect(
      pipe.transform(body, { type: 'body', metatype: CommentDto }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it.each([1, 300])('trims a comment of length %i', async (length) => {
    const content = '가'.repeat(length);
    await expect(
      pipe.transform(
        { content: ` ${content} ` },
        {
          type: 'body',
          metatype: CommentDto,
        },
      ),
    ).resolves.toMatchObject({ content });
  });

  it('defaults to the first page', async () => {
    await expect(
      pipe.transform({}, { type: 'query', metatype: ListPostsDto }),
    ).resolves.toMatchObject({ page: 1 });
  });

  it.each(['1', '3', '100000'])('parses page %s', async (page) => {
    await expect(
      pipe.transform({ page }, { type: 'query', metatype: ListPostsDto }),
    ).resolves.toMatchObject({ page: Number(page) });
  });

  it.each([
    '0',
    '-1',
    '1.5',
    'abc',
    '',
    ' ',
    '1e2',
    'Infinity',
    ['1', '2'],
    null,
  ])('rejects invalid page %j', async (page) => {
    await expect(
      pipe.transform({ page }, { type: 'query', metatype: ListPostsDto }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects unknown query fields', async () => {
    await expect(
      pipe.transform(
        { page: '1', extra: true },
        {
          type: 'query',
          metatype: ListPostsDto,
        },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
