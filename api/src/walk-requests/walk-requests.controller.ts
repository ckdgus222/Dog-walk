import {
  Body,
  Controller,
  Get,
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
import type { PublicUser } from '../users/users.service.js';
import { CreateWalkRequestDto } from './dto/create-walk-request.dto.js';
import { ListWalkRequestsDto } from './dto/list-walk-requests.dto.js';
import { WalkRequestsService } from './walk-requests.service.js';

@Controller('walk-requests')
@UseGuards(JwtAuthGuard)
export class WalkRequestsController {
  constructor(
    @Inject(WalkRequestsService) private readonly requests: WalkRequestsService,
  ) {}

  @Post()
  create(
    @Req() request: Request & { user: PublicUser },
    @Body() body: CreateWalkRequestDto,
  ) {
    return this.requests.create(request.user.id, body);
  }

  @Get()
  findAll(
    @Req() request: Request & { user: PublicUser },
    @Query() query: ListWalkRequestsDto,
  ) {
    return this.requests.findAll(request.user.id, query.box);
  }

  @Get('pending-count')
  pendingCount(@Req() request: Request & { user: PublicUser }) {
    return this.requests.pendingCount(request.user.id);
  }

  @Patch(':id/accept')
  accept(
    @Req() request: Request & { user: PublicUser },
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.requests.changeStatus(request.user.id, id, 'ACCEPTED');
  }

  @Patch(':id/reject')
  reject(
    @Req() request: Request & { user: PublicUser },
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.requests.changeStatus(request.user.id, id, 'REJECTED');
  }

  @Patch(':id/cancel')
  cancel(
    @Req() request: Request & { user: PublicUser },
    @Param('id', ParseIdPipe) id: number,
  ) {
    return this.requests.changeStatus(request.user.id, id, 'CANCELED');
  }
}
