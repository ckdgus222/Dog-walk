import { BadRequestException, ParseIntPipe } from '@nestjs/common';
import { ParseIdPipe } from './db-id.js';

describe('ParseIdPipe', () => {
  const pipe = new ParseIdPipe();
  const metadata = { type: 'param' } as const;

  it.each(['1', '2147483647'])('accepts boundary ID %s', async (value) => {
    await expect(pipe.transform(value, metadata)).resolves.toBe(Number(value));
  });

  it.each(['0', '-1', '2147483648', '99999999999999999999'])(
    'rejects out of range ID %s with 400',
    async (value) => {
      await expect(pipe.transform(value, metadata)).rejects.toMatchObject({
        status: 400,
        message: '잘못된 ID예요.',
      });
    },
  );

  it('preserves ParseIntPipe errors for noninteger input', async () => {
    const original = await new ParseIntPipe()
      .transform('abc', metadata)
      .catch((error: BadRequestException) => error.getResponse());
    await expect(pipe.transform('abc', metadata)).rejects.toMatchObject({
      status: 400,
      response: original,
    });
  });
});
