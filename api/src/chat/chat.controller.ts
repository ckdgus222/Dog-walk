import {
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { PublicUser } from '../users/users.service.js';
import { ChatService } from './chat.service.js';

@Controller('walk-requests')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(@Inject(ChatService) private readonly chat: ChatService) {}

  @Get(':id/messages')
  findMessages(
    @Req() request: Request & { user: PublicUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.chat.findMessages(request.user.id, id);
  }
}
