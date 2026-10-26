import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { ParseIdPipe } from '../common/db-id.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { PublicUser } from '../users/users.service.js';
import { DogFormDto } from './dto/dog-form.dto.js';
import { DogsService } from './dogs.service.js';

const photoOptions = { limits: { fileSize: 5 * 1024 * 1024, files: 1 } };

@Controller('dogs')
@UseGuards(JwtAuthGuard)
export class DogsController {
  constructor(@Inject(DogsService) private readonly dogs: DogsService) {}

  @Get('me')
  me(@Req() request: Request & { user: PublicUser }) {
    return this.dogs.findMine(request.user.id);
  }

  @Post()
  @UseInterceptors(FileInterceptor('photo', photoOptions))
  create(
    @Req() request: Request & { user: PublicUser },
    @Body() body: DogFormDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.dogs.create(request.user.id, body.dog, photo);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('photo', photoOptions))
  update(
    @Req() request: Request & { user: PublicUser },
    @Param('id', ParseIdPipe) id: number,
    @Body() body: DogFormDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.dogs.update(request.user.id, id, body.dog, photo);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Req() request: Request & { user: PublicUser },
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.dogs.remove(request.user.id, id);
  }
}
