import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsByteLength, IsNotEmpty, IsString, Length } from 'class-validator';

// Account field rules shared by signup, login and the profile update, so
// the forms can never accept different nicknames or passwords.

// bcrypt reads only the first 72 bytes, so longer input is refused instead
// of being silently cut.
const BCRYPT_MAX_BYTES = 72;

export const PASSWORD_HASH_ROUNDS = 10;

export const NicknameRules = () =>
  applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim() : value,
    ),
    IsString(),
    Length(2, 20),
  );

// A password being set: signup, or a new password on the profile.
export const NewPasswordRules = () =>
  applyDecorators(IsString(), Length(8, 20), IsByteLength(0, BCRYPT_MAX_BYTES));

// A password being checked: login, or the current password on the profile.
export const PasswordInputRules = () =>
  applyDecorators(IsString(), IsNotEmpty(), IsByteLength(0, BCRYPT_MAX_BYTES));
