import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateUserDto } from './update-user.dto.js';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const metadata = { type: 'body' as const, metatype: UpdateUserDto };

describe('UpdateUserDto validation', () => {
  it('trims only the nickname and preserves password spaces', async () => {
    await expect(
      pipe.transform(
        {
          nickname: ' 보호자 ',
          currentPassword: ' old password ',
          newPassword: ' new password ',
        },
        metadata,
      ),
    ).resolves.toMatchObject({
      nickname: '보호자',
      currentPassword: ' old password ',
      newPassword: ' new password ',
    });
  });

  it.each(['가나', '가'.repeat(20)])(
    'accepts nickname length boundaries',
    async (nickname) => {
      await expect(
        pipe.transform({ nickname: ` ${nickname} ` }, metadata),
      ).resolves.toHaveProperty('nickname', nickname);
    },
  );

  it.each(['a'.repeat(8), 'a'.repeat(20), '🐕'.repeat(18)])(
    'accepts new password length and byte boundaries',
    async (newPassword) => {
      await expect(
        pipe.transform({ currentPassword: 'x', newPassword }, metadata),
      ).resolves.toHaveProperty('newPassword', newPassword);
    },
  );

  it.each(['a'.repeat(72), '🐕'.repeat(18)])(
    'accepts a 72-byte current password without the signup character limit',
    async (currentPassword) => {
      await expect(
        pipe.transform(
          { currentPassword, newPassword: 'password123' },
          metadata,
        ),
      ).resolves.toHaveProperty('currentPassword', currentPassword);
    },
  );

  it.each([
    { nickname: '' },
    { nickname: ' ' },
    { nickname: '가' },
    { nickname: '가'.repeat(21) },
    { nickname: null },
    { nickname: 123 },
    { newPassword: '' },
    { newPassword: 'a'.repeat(7) },
    { newPassword: 'a'.repeat(21) },
    { newPassword: '🐕'.repeat(18) + 'a' },
    { newPassword: null },
    { newPassword: 123 },
    { currentPassword: '' },
    { currentPassword: null },
    { currentPassword: 123 },
    { currentPassword: 'a'.repeat(73) },
    { currentPassword: '🐕'.repeat(18) + 'a' },
    { email: 'other@example.com' },
    { id: 2 },
  ])('rejects invalid or unknown input %#', async (changes) => {
    await expect(
      pipe.transform(
        {
          nickname: '보호자',
          currentPassword: 'password123',
          newPassword: 'new-password',
          ...changes,
        },
        metadata,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
