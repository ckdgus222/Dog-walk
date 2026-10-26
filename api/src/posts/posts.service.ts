import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PostDto } from './dto/post.dto.js';
import type { CommentDto } from './dto/comment.dto.js';

const postSelect = {
  id: true,
  title: true,
  content: true,
  author: { select: { id: true, nickname: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PostSelect;

const commentSelect = {
  id: true,
  postId: true,
  content: true,
  author: { select: { id: true, nickname: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CommentSelect;

const PAGE_SIZE = 10;

@Injectable()
export class PostsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  create(authorId: number, body: PostDto) {
    return this.prisma.post.create({
      data: { title: body.title, content: body.content, authorId },
      select: postSelect,
    });
  }

  async findAll(page: number) {
    const [posts, total] = await this.prisma.$transaction(
      [
        this.prisma.post.findMany({
          // The integer primary key bounds the number of possible rows.
          skip: Math.min((page - 1) * PAGE_SIZE, 2147483647),
          take: PAGE_SIZE,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            ...postSelect,
            content: false,
            _count: { select: { comments: true } },
          },
        }),
        this.prisma.post.count(),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      posts: posts.map(({ _count, ...post }) => ({
        ...post,
        commentCount: _count.comments,
      })),
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  }

  async findOne(id: number) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      select: postSelect,
    });
    if (!post) throw new NotFoundException('글을 찾을 수 없어요.');
    return post;
  }

  async update(authorId: number, id: number, body: PostDto) {
    const result = await this.prisma.post.updateMany({
      where: { id, authorId },
      data: body,
    });
    if (result.count === 0) {
      await this.findOne(id);
      throw new ForbiddenException('내 글만 수정할 수 있어요.');
    }
    return this.findOne(id);
  }

  async remove(authorId: number, id: number) {
    const result = await this.prisma.post.deleteMany({
      where: { id, authorId },
    });
    if (result.count === 0) {
      await this.findOne(id);
      throw new ForbiddenException('내 글만 삭제할 수 있어요.');
    }
  }

  async findComments(postId: number) {
    await this.findOne(postId);
    return this.prisma.comment.findMany({
      where: { postId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: commentSelect,
    });
  }

  async addComment(authorId: number, postId: number, body: CommentDto) {
    // No existence check first: the foreign key rejects a missing post, and
    // that also covers a post deleted while this request is running.
    try {
      return await this.prisma.comment.create({
        data: { content: body.content, postId, authorId },
        select: commentSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new NotFoundException('글을 찾을 수 없어요.');
      }
      throw error;
    }
  }

  private async findComment(id: number) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
      select: commentSelect,
    });
    if (!comment) throw new NotFoundException('댓글을 찾을 수 없어요.');
    return comment;
  }

  async updateComment(authorId: number, id: number, body: CommentDto) {
    const result = await this.prisma.comment.updateMany({
      where: { id, authorId },
      data: body,
    });
    if (result.count === 0) {
      await this.findComment(id);
      throw new ForbiddenException('내 댓글만 수정할 수 있어요.');
    }
    return this.findComment(id);
  }

  async removeComment(authorId: number, id: number) {
    const result = await this.prisma.comment.deleteMany({
      where: { id, authorId },
    });
    if (result.count === 0) {
      await this.findComment(id);
      throw new ForbiddenException('내 댓글만 삭제할 수 있어요.');
    }
  }
}
