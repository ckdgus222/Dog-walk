import { Transform } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

// "?page=" of a paged list. Only plain digits count, so "1e2", "1.5" and
// repeated keys are rejected instead of being read as some other page.
export class PageQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN,
  )
  @IsInt()
  @Min(1)
  page: number = 1;
}
