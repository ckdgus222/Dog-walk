import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const messageSelect = {
  id: true,
  walkRequestId: true,
  senderId: true,
  content: true,
  createdAt: true,
  sender: { select: { nickname: true } },
} as const;

@Injectable()
export class ChatService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async findAcceptedRequest(userId: number, id: number) {
    // PostgreSQL integer IDs cannot contain values outside this range.
    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
      throw new NotFoundException('산책 요청을 찾을 수 없어요.');
    }
    const request = await this.prisma.walkRequest.findUnique({
      where: { id },
      select: {
        status: true,
        requester: { select: { id: true, nickname: true } },
        receiver: { select: { id: true, nickname: true } },
      },
    });
    if (
      !request ||
      (request.requester.id !== userId && request.receiver.id !== userId)
    ) {
      throw new NotFoundException('산책 요청을 찾을 수 없어요.');
    }
    if (request.status !== 'ACCEPTED') {
      throw new ForbiddenException('수락된 산책 요청에서만 채팅할 수 있어요.');
    }
    return request;
  }

  async findMessages(userId: number, walkRequestId: number) {
    const request = await this.findAcceptedRequest(userId, walkRequestId);
    const messages = await this.prisma.chatMessage.findMany({
      where: { walkRequestId },
      select: messageSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    return {
      counterpart:
        request.requester.id === userId ? request.receiver : request.requester,
      messages: messages.reverse().map(({ sender, ...message }) => ({
        ...message,
        senderNickname: sender.nickname,
      })),
    };
  }

  async send(userId: number, payload: unknown) {
    const { walkRequestId, content } = (payload ?? {}) as {
      walkRequestId?: unknown;
      content?: unknown;
    };
    if (
      typeof walkRequestId !== 'number' ||
      !Number.isSafeInteger(walkRequestId) ||
      walkRequestId <= 0 ||
      typeof content !== 'string' ||
      content.trim().length < 1 ||
      content.trim().length > 500
    ) {
      throw new BadRequestException('메시지는 1~500자로 입력해 주세요.');
    }
    const request = await this.findAcceptedRequest(userId, walkRequestId);
    const { sender, ...message } = await this.prisma.chatMessage.create({
      data: { walkRequestId, senderId: userId, content: content.trim() },
      select: messageSelect,
    });
    return {
      message: { ...message, senderNickname: sender.nickname },
      participantIds: [request.requester.id, request.receiver.id],
    };
  }
}
