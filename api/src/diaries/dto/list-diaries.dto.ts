import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { PageQueryDto } from '../../common/page-query.dto.js';

export class ListDiariesDto extends PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dogId?: number;
}
