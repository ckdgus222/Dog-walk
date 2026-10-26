import { Transform } from 'class-transformer';
import {
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MAX_DB_ID } from '../../common/db-id.js';

export class CreateWalkRequestDto {
  @IsInt()
  @Min(1)
  @Max(MAX_DB_ID)
  receiverId: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  message?: string;
}
