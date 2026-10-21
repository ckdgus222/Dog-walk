import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { DogFormDto } from './dog-form.dto.js';
import { DogDto } from './dog.dto.js';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const dog = {
  name: ' 보리 ',
  breed: ' 푸들 ',
  size: 'SMALL',
  gender: 'FEMALE',
  neutered: false,
  birthYear: 2020,
  personality: ' 산책을 좋아해요 ',
};

describe('Dog multipart validation', () => {
  it('parses and validates a nested DogDto, retaining signup normalization', async () => {
    const result = await pipe.transform(
      { dog: JSON.stringify(dog) },
      { type: 'body', metatype: DogFormDto },
    );
    expect(result.dog).toBeInstanceOf(DogDto);
    expect(result.dog).toEqual({
      ...dog,
      name: '보리',
      breed: '푸들',
      personality: '산책을 좋아해요',
    });
  });

  it.each([
    undefined,
    null,
    {},
    dog,
    'not json',
    'null',
    '[]',
    JSON.stringify([dog]),
    ...Object.keys(dog).map((field) =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(dog).filter(([key]) => key !== field),
        ),
      ),
    ),
    JSON.stringify({ ...dog, neutered: 'true' }),
    JSON.stringify({ ...dog, birthYear: 1989 }),
    JSON.stringify({ ...dog, birthYear: new Date().getFullYear() + 1 }),
    JSON.stringify({ ...dog, personality: 'a'.repeat(101) }),
    JSON.stringify({ ...dog, photoUrl: '/uploads/dogs/foreign.webp' }),
  ])('rejects invalid multipart dog %#', async (value) => {
    await expect(
      pipe.transform({ dog: value }, { type: 'body', metatype: DogFormDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects extra multipart fields', async () => {
    await expect(
      pipe.transform(
        { dog: JSON.stringify(dog), extra: 'value' },
        { type: 'body', metatype: DogFormDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
