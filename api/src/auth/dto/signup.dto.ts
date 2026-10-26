import { Transform, Type } from 'class-transformer';
import { IsEmail, IsObject, MaxLength, ValidateNested } from 'class-validator';
import { NewPasswordRules, NicknameRules } from '../../common/account-rules.js';
import { DogDto } from '../../dogs/dto/dog.dto.js';

export class SignupDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @NewPasswordRules()
  password: string;

  @NicknameRules()
  nickname: string;

  @IsObject()
  @ValidateNested()
  @Type(() => DogDto)
  dog: DogDto;
}
