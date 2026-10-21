import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { SignupDto } from './signup.dto.js';
import { LoginDto } from './login.dto.js';

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
  personality: ' 얌전해요 ',
};
const signup = {
  email: ' OWNER@Example.COM ',
  password: 'password123',
  nickname: ' 보호자 ',
  dog,
};

describe('Auth DTO validation', () => {
  it('normalizes only the intended string fields', async () => {
    const input = await pipe.transform(
      { ...signup, password: ' password ' },
      { type: 'body', metatype: SignupDto },
    );
    expect(input).toMatchObject({
      email: 'owner@example.com',
      password: ' password ',
      nickname: '보호자',
      dog: {
        name: '보리',
        breed: '푸들',
        personality: '얌전해요',
        neutered: false,
      },
    });
  });

  it.each([
    undefined,
    null,
    [],
    [dog],
    ...Object.keys(dog).map((field) =>
      Object.fromEntries(Object.entries(dog).filter(([key]) => key !== field)),
    ),
    { ...dog, size: 'XL' },
    { ...dog, gender: 'UNKNOWN' },
    { ...dog, neutered: 'true' },
    { ...dog, birthYear: 1989 },
    { ...dog, birthYear: new Date().getFullYear() + 1 },
    { ...dog, birthYear: 2020.5 },
    { ...dog, personality: ' ' },
    { ...dog, personality: 'a'.repeat(101) },
    { ...dog, photoUrl: 'unexpected' },
  ])('rejects invalid dog input %#', async (invalidDog) => {
    await expect(
      pipe.transform(
        { ...signup, dog: invalidDog },
        { type: 'body', metatype: SignupDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    { email: 'invalid' },
    { email: 'a'.repeat(255) },
    { password: 'a'.repeat(7) },
    { password: 'a'.repeat(21) },
    { password: '🐕'.repeat(19) },
    { nickname: 'x' },
    { nickname: 'x'.repeat(21) },
    { extra: true },
  ])('rejects invalid account input %#', async (changes) => {
    await expect(
      pipe.transform(
        { ...signup, ...changes },
        { type: 'body', metatype: SignupDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts an 18-character 72-byte password for signup and login', async () => {
    const password = '🐕'.repeat(18);
    await expect(
      pipe.transform(
        { ...signup, password },
        { type: 'body', metatype: SignupDto },
      ),
    ).resolves.toHaveProperty('password', password);
    await expect(
      pipe.transform(
        { email: signup.email, password },
        { type: 'body', metatype: LoginDto },
      ),
    ).resolves.toMatchObject({ email: 'owner@example.com', password });
  });

  it.each([
    { password: '🐕'.repeat(18) + 'a' },
    { password: 123 },
    { email: 123 },
    { extra: true },
    { password: undefined },
  ])('rejects invalid login input %#', async (changes) => {
    await expect(
      pipe.transform(
        { email: signup.email, password: signup.password, ...changes },
        { type: 'body', metatype: LoginDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
