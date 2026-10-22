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
    const { requester, receiver, ...fields } = await this.prisma.walkRequest
      .create({
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
      })
      .catch(async (error) => {
        // 두 사람 사이에 PENDING 요청이 있으면 마이그레이션의
        // walk_requests_pending_pair_key가 저장을 막고, 이 경우 409로 돌려준다.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw await this.pendingConflictError(userId, receiverId);
        }
        throw error;
      });
    this.events.sendToUser(receiverId, 'walk-request:received', {
      ...fields,
      counterpart: requester,
    });
    return { ...fields, counterpart: receiver };
  }

  private async pendingConflictError(
    userId: number,
    receiverId: number,
  ): Promise<ConflictException> {
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
      return new ConflictException({
        message: '상대가 보낸 요청이 있어요. 받은 요청에서 수락해 주세요.',
        code: 'REVERSE_PENDING',
      });
    }
    // 내가 이미 보냈거나, 그 사이 처리되어 찾지 못한(null) 경우다.
    return new ConflictException({
      message: '이미 보낸 요청이 있어요.',
      code: 'ALREADY_PENDING',
    });
  }

  async findAll(userId: number, box: 'received' | 'sent') {
    const received = box === 'received';
    const requests = await this.prisma.walkRequest.findMany({
      where: received ? { receiverId: userId } : { requesterId: userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        ...publicRequestSelect,
        requester: received ? { select: counterpartSelect } : false,
        receiver: received ? false : { select: counterpartSelect },
      },
    });
    return requests.map(({ requester, receiver, ...fields }) => ({
      ...fields,
      // 받은 요청이면 보낸 사람, 보낸 요청이면 받는 사람이 상대다.
      counterpart: received ? requester : receiver,
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
    // 권한·PENDING 확인과 변경을 한 쿼리로 해야 수락과 취소가 동시에 와도 하나만 성공한다.
    const result = await this.prisma.walkRequest.updateMany({
      where: {
        id,
        status: 'PENDING',
        // 취소는 보낸 사람만, 수락·거절은 받은 사람만 한다.
        ...(canceling ? { requesterId: userId } : { receiverId: userId }),
      },
      // 취소 시각은 기록하지 않는다.
      data: { status, respondedAt: canceling ? null : new Date() },
    });
    if (result.count === 0) throw await this.changeStatusError(userId, id);
    const request = await this.prisma.walkRequest.findUniqueOrThrow({
      where: { id },
    });
    const counterpartId = canceling ? request.receiverId : request.requesterId;
    const payload = { id, status };
    this.events.sendToUser(counterpartId, 'walk-request:changed', payload);
    return payload;
  }

  private async changeStatusError(userId: number, id: number) {
    const request = await this.prisma.walkRequest.findFirst({
      where: { id, OR: [{ requesterId: userId }, { receiverId: userId }] },
    });
    // 남의 요청도 없는 요청처럼 답해 요청이 있는지 알려 주지 않는다.
    if (!request) return new NotFoundException('산책 요청을 찾을 수 없어요.');
    if (request.status === 'PENDING')
      return new ForbiddenException('이 요청을 처리할 권한이 없어요.');
    return new ConflictException('이미 처리된 요청이에요.');
  }
}
