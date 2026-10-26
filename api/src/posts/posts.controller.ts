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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ParseIdPipe } from '../common/db-id.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JsonBodyGuard } from '../auth/guards/json-body.guard.js';
import type { PublicUser } from '../users/users.service.js';
import { PostDto } from './dto/post.dto.js';
import { CommentDto } from './dto/comment.dto.js';
import { ListPostsDto } from './dto/list-posts.dto.js';
import { PostsService } from './posts.service.js';

@Controller()
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(@Inject(PostsService) private readonly posts: PostsService) {}

  @Post('posts')
  @UseGuards(JsonBodyGuard)
  create(
    @Req() request: Request & { user: PublicUser },
    @Body() body: PostDto,
  ) {
    return this.posts.create(request.user.id, body);
  }

  @Get('posts')
  findAll(@Query() query: ListPostsDto) {
    return this.posts.findAll(query.page);
  }

  @Get('posts/:id')
  findOne(@Param('id', ParseIdPipe) id: number) {
    return this.posts.findOne(id);
  }

  @Patch('posts/:id')
  @UseGuards(JsonBodyGuard)
  update(
    @Req() request: Request & { user: PublicUser },
    @Param('id', ParseIdPipe) id: number,
    @Body() body: PostDto,
  ) {
    return this.posts.update(request.user.id, id, body);
  }

  @Delete('posts/:id')
  @HttpCode(204)
  remove(
    @Req() request: Request & { user: PublicUser },
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.posts.remove(request.user.id, id);
  }

  @Get('posts/:id/comments')
  findComments(@Param('id', ParseIdPipe) id: number) {
    return this.posts.findComments(id);
  }

  @Post('posts/:id/comments')
  @UseGuards(JsonBodyGuard)
  addComment(
    @Req() request: Request & { user: PublicUser },
    @Param('id', ParseIdPipe) id: number,
    @Body() body: CommentDto,
  ) {
    return this.posts.addComment(request.user.id, id, body);
  }

  @Patch('comments/:id')
  @UseGuards(JsonBodyGuard)
  updateComment(
    @Req() request: Request & { user: PublicUser },
    @Param('id', ParseIdPipe) id: number,
    @Body() body: CommentDto,
  ) {
    return this.posts.updateComment(request.user.id, id, body);
  }

  @Delete('comments/:id')
  @HttpCode(204)
  removeComment(
    @Req() request: Request & { user: PublicUser },
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.posts.removeComment(request.user.id, id);
  }
}
