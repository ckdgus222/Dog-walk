import { Transform } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min, ValidateIf } from 'class-validator';

export class CreateWalkRequestDto {
  @IsInt()
  @Min(1)
  receiverId: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  message?: string;
}
