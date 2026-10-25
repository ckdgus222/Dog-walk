import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { PasswordInputRules } from '../../common/account-rules.js';

// The global ValidationPipe normalizes the email and rejects invalid body
// credentials before the controller calls AuthService.validateUser.
export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  email: string;

  @PasswordInputRules()
  password: string;
}
