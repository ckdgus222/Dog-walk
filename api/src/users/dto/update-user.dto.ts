import { ValidateIf } from 'class-validator';
import {
  NewPasswordRules,
  NicknameRules,
  PasswordInputRules,
} from '../../common/account-rules.js';

// Each field is checked on its own when sent. Which fields must come
// together is UsersService.update's rule.
const whenSent = ValidateIf((_object, value: unknown) => value !== undefined);

export class UpdateUserDto {
  @whenSent
  @NicknameRules()
  nickname?: string;

  @whenSent
  @PasswordInputRules()
  currentPassword?: string;

  @whenSent
  @NewPasswordRules()
  newPassword?: string;
}
