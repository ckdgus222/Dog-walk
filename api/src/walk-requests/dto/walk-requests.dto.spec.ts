import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { CreateWalkRequestDto } from './create-walk-request.dto.js';
import { ListWalkRequestsDto } from './list-walk-requests.dto.js';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

describe('Walk request DTO validation', () => {
  it.each([
    {},
    { receiverId: '2' },
    { receiverId: 0 },
    { receiverId: -1 },
    { receiverId: 1.5 },
    { receiverId: null },
    { receiverId: 2, message: null },
    { receiverId: 2, message: 10 },
    { receiverId: 2, message: 'a'.repeat(101) },
    { receiverId: 2, extra: true },
  ])('rejects invalid input %j', async (body) => {
    await expect(
      pipe.transform(body, { type: 'body', metatype: CreateWalkRequestDto }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it.each(['', '   ', ' 같이 걸어요 ', ` ${'a'.repeat(100)} `])(
    'trims before checking the message length',
    async (message) => {
      await expect(
        pipe.transform(
          { receiverId: 2, message },
          { type: 'body', metatype: CreateWalkRequestDto },
        ),
      ).resolves.toMatchObject({ receiverId: 2, message: message.trim() });
    },
  );

  it('allows an omitted message', async () => {
    await expect(
      pipe.transform(
        { receiverId: 2 },
        { type: 'body', metatype: CreateWalkRequestDto },
      ),
    ).resolves.toMatchObject({ receiverId: 2 });
  });

  it.each([
    {},
    { box: 'all' },
    { box: ['received', 'sent'] },
    { box: 'sent', extra: true },
  ])('rejects invalid box %j', async (query) => {
    await expect(
      pipe.transform(query, { type: 'query', metatype: ListWalkRequestsDto }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
