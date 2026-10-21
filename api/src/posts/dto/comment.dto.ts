import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class CommentDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 300)
  content: string;
}
