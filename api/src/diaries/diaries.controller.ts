import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { PublicUser } from '../users/users.service.js';
import { DiariesService } from './diaries.service.js';
import { DiaryFormDto, UpdateDiaryFormDto } from './dto/diary-form.dto.js';
import { ListDiariesDto } from './dto/list-diaries.dto.js';

const photoOptions = { limits: { fileSize: 5 * 1024 * 1024, files: 5 } };

@Controller('diaries')
@UseGuards(JwtAuthGuard)
export class DiariesController {
  constructor(
    @Inject(DiariesService) private readonly diaries: DiariesService,
  ) {}

  @Post()
  @UseInterceptors(FilesInterceptor('images', 5, photoOptions))
  create(
    @Req() request: Request & { user: PublicUser },
    @Body() body: DiaryFormDto,
    @UploadedFiles() images?: Express.Multer.File[],
  ) {
    return this.diaries.create(request.user.id, body.diary, images);
  }

  @Get()
  list(
    @Req() request: Request & { user: PublicUser },
    @Query() query: ListDiariesDto,
  ) {
    return this.diaries.findMine(request.user.id, query.dogId, query.page);
  }

  @Get(':id')
  detail(
    @Req() request: Request & { user: PublicUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.diaries.findOne(request.user.id, id);
  }

  @Get(':id/images/:imageId')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async image(
    @Req() request: Request & { user: PublicUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('imageId', ParseIntPipe) imageId: number,
  ) {
    return new StreamableFile(
      await this.diaries.readImage(request.user.id, id, imageId),
      { type: 'image/webp' },
    );
  }

  @Patch(':id')
  @UseInterceptors(FilesInterceptor('images', 5, photoOptions))
  update(
    @Req() request: Request & { user: PublicUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateDiaryFormDto,
    @UploadedFiles() images?: Express.Multer.File[],
  ) {
    return this.diaries.update(request.user.id, id, body.diary, images);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Req() request: Request & { user: PublicUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.diaries.remove(request.user.id, id);
  }
}
