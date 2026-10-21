import { Transform } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class ListPostsDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN,
  )
  @IsInt()
  @Min(1)
  page: number = 1;
}
