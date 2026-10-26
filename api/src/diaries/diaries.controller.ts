import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
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
import { ParseIdPipe } from '../common/db-id.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { rejectDemoUploads } from '../auth/guards/not-demo.guard.js';
import type { PublicUser } from '../users/users.service.js';
import { DiariesService } from './diaries.service.js';
import { DiaryFormDto, UpdateDiaryFormDto } from './dto/diary-form.dto.js';
import { ListDiariesDto } from './dto/list-diaries.dto.js';

const photoOptions = {
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: rejectDemoUploads,
};

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
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.diaries.findOne(request.user.id, id);
  }

  @Get(':id/images/:imageId')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async image(
    @Req() request: Request & { user: PublicUser },
    @Param('id', ParseIdPipe) id: number,
    @Param('imageId', ParseIdPipe) imageId: number,
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
    @Param('id', ParseIdPipe) id: number,
    @Body() body: UpdateDiaryFormDto,
    @UploadedFiles() images?: Express.Multer.File[],
  ) {
    return this.diaries.update(request.user.id, id, body.diary, images);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Req() request: Request & { user: PublicUser },
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.diaries.remove(request.user.id, id);
  }
}
