import { plainToInstance, Transform } from 'class-transformer';
import { IsObject, ValidateNested } from 'class-validator';
import { DogDto } from './dog.dto.js';

export class DogFormDto {
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return undefined;
    try {
      // Nested validation needs a DTO instance after parsing multipart text.
      return plainToInstance(DogDto, JSON.parse(value));
    } catch {
      return undefined;
    }
  })
  @IsObject()
  @ValidateNested()
  dog: DogDto;
}
