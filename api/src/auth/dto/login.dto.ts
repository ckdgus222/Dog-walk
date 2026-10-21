import { Transform } from 'class-transformer';
import { IsByteLength, IsNotEmpty, IsString } from 'class-validator';

// The global ValidationPipe normalizes the email and rejects invalid body
// credentials before the controller calls AuthService.validateUser.
export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @IsByteLength(0, 72)
  password: string;
}
