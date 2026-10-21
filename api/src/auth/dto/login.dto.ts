import { Transform } from 'class-transformer';
import { IsByteLength, IsNotEmpty, IsString } from 'class-validator';

// Empty values must be rejected: passport-local falls back to the URL query
// string when a body field is empty, which would skip the 72-byte check.
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
