import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ListDiariesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dogId?: number;
}
