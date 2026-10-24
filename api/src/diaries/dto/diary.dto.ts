import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Length,
  Min,
  ValidateBy,
  ValidateIf,
} from 'class-validator';

export class DiaryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 50)
  title: string;

  @IsInt()
  @Min(1)
  dogId: number;

  @IsString()
  @ValidateBy({
    name: 'realCalendarDate',
    validator: {
      validate: (value: unknown) => {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
          return false;
        const date = new Date(`${value}T00:00:00.000Z`);
        return (
          Number(value.slice(0, 4)) > 0 &&
          !Number.isNaN(date.getTime()) &&
          date.toISOString().slice(0, 10) === value
        );
      },
      defaultMessage: () => '산책한 날짜를 올바르게 골라 주세요.',
    },
  })
  walkedOn: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 2000)
  content: string;
}

export class UpdateDiaryDto extends DiaryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  // A diary has at most 5 photos. Keep both checks linear: class-validator's
  // ArrayUnique compares every pair, so a huge array could stall the server.
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateBy({
    name: 'uniqueIds',
    validator: {
      validate: (value: unknown) =>
        Array.isArray(value) && new Set(value).size === value.length,
      defaultMessage: () => 'removeImageIds must not contain duplicates',
    },
  })
  @IsInt({ each: true })
  removeImageIds?: number[];
}
