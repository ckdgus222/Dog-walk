import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { publicDogSelect } from '../dogs/dogs.service.js';
import { EventsGateway } from '../events/events.gateway.js';
import { Prisma } from '../generated/prisma/client.js';
import { LocationService } from '../location/location.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateWalkRequestDto } from './dto/create-walk-request.dto.js';

const publicRequestSelect = {
  id: true,
  status: true,
  message: true,
  createdAt: true,
  respondedAt: true,
} as const;
const counterpartSelect = {
  id: true,
  nickname: true,
  dogs: {
    select: publicDogSelect,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class WalkRequestsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LocationService) private readonly location: LocationService,
    @Inject(EventsGateway) private readonly events: EventsGateway,
  ) {}

  async create(userId: number, input: CreateWalkRequestDto) {
    const { receiverId } = input;
    if (userId === receiverId) {
      throw new BadRequestException('나에게는 산책 요청을 보낼 수 없어요.');
    }
    if (!(await this.location.isNearby(userId, receiverId))) {
      throw new ForbiddenException(
        '주변 사용자에게만 산책 요청을 보낼 수 있어요.',
      );
    }
    let request;
    try {
      request = await this.prisma.walkRequest.create({
        data: {
          requesterId: userId,
          receiverId,
          message: input.message?.trim() || null,
        },
        select: {
          ...publicRequestSelect,
          requester: { select: counterpartSelect },
          receiver: { select: counterpartSelect },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const pending = await this.prisma.walkRequest.findFirst({
          where: {
            status: 'PENDING',
            OR: [
              { requesterId: userId, receiverId },
              { requesterId: receiverId, receiverId: userId },
            ],
          },
        });
        if (pending?.requesterId === receiverId) {
          throw new ConflictException({
            message: '상대가 보낸 요청이 있어요. 받은 요청에서 수락해 주세요.',
            code: 'REVERSE_PENDING',
          });
        }
        throw new ConflictException({
          message: '이미 보낸 요청이 있어요.',
          code: 'ALREADY_PENDING',
        });
      }
      throw error;
    }
    const { requester, receiver, ...fields } = request;
    this.events.sendToUser(receiverId, 'walk-request:received', {
      ...fields,
      counterpart: requester,
    });
    return { ...fields, counterpart: receiver };
  }

  async findAll(userId: number, box: 'received' | 'sent') {
    const requests = await this.prisma.walkRequest.findMany({
      where:
        box === 'received' ? { receiverId: userId } : { requesterId: userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        ...publicRequestSelect,
        requester: box === 'received' ? { select: counterpartSelect } : false,
        receiver: box === 'sent' ? { select: counterpartSelect } : false,
      },
    });
    return requests.map(({ requester, receiver, ...fields }) => ({
      ...fields,
      counterpart: box === 'received' ? requester : receiver,
    }));
  }

  async pendingCount(userId: number) {
    const count = await this.prisma.walkRequest.count({
      where: { receiverId: userId, status: 'PENDING' },
    });
    return { count };
  }

  async changeStatus(
    userId: number,
    id: number,
    status: 'ACCEPTED' | 'REJECTED' | 'CANCELED',
  ) {
    const canceling = status === 'CANCELED';
    const result = await this.prisma.walkRequest.updateMany({
      where: {
        id,
        status: 'PENDING',
        ...(canceling ? { requesterId: userId } : { receiverId: userId }),
      },
      data: { status, respondedAt: canceling ? null : new Date() },
    });
    if (result.count === 0) {
      const request = await this.prisma.walkRequest.findFirst({
        where: { id, OR: [{ requesterId: userId }, { receiverId: userId }] },
      });
      if (!request) throw new NotFoundException('산책 요청을 찾을 수 없어요.');
      if (request.status === 'PENDING')
        throw new ForbiddenException('이 요청을 처리할 권한이 없어요.');
      throw new ConflictException('이미 처리된 요청이에요.');
    }
    const request = await this.prisma.walkRequest.findUniqueOrThrow({
      where: { id },
    });
    const payload = { id, status };
    this.events.sendToUser(
      canceling ? request.receiverId : request.requesterId,
      'walk-request:changed',
      payload,
    );
    return payload;
  }
}
