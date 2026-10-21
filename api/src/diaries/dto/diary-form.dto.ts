import { plainToInstance, Transform } from 'class-transformer';
import { IsObject, ValidateNested } from 'class-validator';
import { DiaryDto, UpdateDiaryDto } from './diary.dto.js';

export class DiaryFormDto {
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return undefined;
    try {
      return plainToInstance(DiaryDto, JSON.parse(value));
    } catch {
      return undefined;
    }
  })
  @IsObject()
  @ValidateNested()
  diary: DiaryDto;
}

export class UpdateDiaryFormDto {
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return undefined;
    try {
      return plainToInstance(UpdateDiaryDto, JSON.parse(value));
    } catch {
      return undefined;
    }
  })
  @IsObject()
  @ValidateNested()
  diary: UpdateDiaryDto;
}
