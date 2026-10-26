import {
  type ArgumentMetadata,
  BadRequestException,
  Injectable,
  ParseIntPipe,
  type PipeTransform,
} from '@nestjs/common';

// The largest PostgreSQL integer; a bigger ID makes Prisma throw a 500.
export const MAX_DB_ID = 2147483647;

@Injectable()
export class ParseIdPipe implements PipeTransform<string, Promise<number>> {
  async transform(value: string, metadata: ArgumentMetadata): Promise<number> {
    const id = await new ParseIntPipe().transform(value, metadata);
    if (id == null || id < 1 || id > MAX_DB_ID) {
      throw new BadRequestException('잘못된 ID예요.');
    }
    return id;
  }
}
