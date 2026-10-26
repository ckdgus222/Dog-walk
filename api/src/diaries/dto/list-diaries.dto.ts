import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_DB_ID } from '../../common/db-id.js';
import { PageQueryDto } from '../../common/page-query.dto.js';

export class ListDiariesDto extends PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DB_ID)
  dogId?: number;
}
