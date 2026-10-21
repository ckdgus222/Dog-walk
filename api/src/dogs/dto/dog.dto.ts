import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsString,
  Length,
  Min,
  ValidateBy,
} from 'class-validator';
import { DogGender, DogSize } from '../../generated/prisma/enums.js';

export class DogDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 20)
  name: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 30)
  breed: string;

  @IsEnum(DogSize)
  size: DogSize;

  @IsEnum(DogGender)
  gender: DogGender;

  @IsBoolean()
  neutered: boolean;

  @IsInt()
  @Min(1990)
  @ValidateBy({
    name: 'notFutureYear',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'number' && value <= new Date().getFullYear(),
      defaultMessage: () => 'birthYear must not be later than the current year',
    },
  })
  birthYear: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  personality: string;
}
