import { Transform, Type } from 'class-transformer';
import {
  IsByteLength,
  IsEmail,
  IsObject,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SignupDogDto } from './signup-dog.dto.js';

export class SignupDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @Length(8, 20)
  @IsByteLength(0, 72)
  password: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(2, 20)
  nickname: string;

  @IsObject()
  @ValidateNested()
  @Type(() => SignupDogDto)
  dog: SignupDogDto;
}
