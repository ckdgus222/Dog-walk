import { ChatService } from './chat.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('ChatService', () => {
  const prisma = {
    walkRequest: { findUnique: vi.fn() },
    chatMessage: { findMany: vi.fn(), create: vi.fn() },
  };
  const service = new ChatService(prisma as unknown as PrismaService);
  const requester = { id: 1, nickname: '보호자A' };
  const receiver = { id: 2, nickname: '보호자B' };

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.walkRequest.findUnique.mockResolvedValue({
      requester,
      receiver,
      status: 'ACCEPTED',
    });
  });

  it.each([
    null,
    {},
    { walkRequestId: 1, content: '' },
    { walkRequestId: 1, content: ' \n\t ' },
    { walkRequestId: 1, content: 'a'.repeat(501) },
    { walkRequestId: 1, content: 123 },
    { walkRequestId: 1, content: null },
    { walkRequestId: 0, content: 'hello' },
    { walkRequestId: -1, content: 'hello' },
    { walkRequestId: 1.5, content: 'hello' },
    { walkRequestId: '1', content: 'hello' },
    { walkRequestId: Number.MAX_SAFE_INTEGER + 1, content: 'hello' },
  ])('rejects invalid input before querying or saving: %j', async (payload) => {
    await expect(service.send(1, payload)).rejects.toThrow(
      '메시지는 1~500자로 입력해 주세요.',
    );
    expect(prisma.walkRequest.findUnique).not.toHaveBeenCalled();
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });

  it.each(['PENDING', 'REJECTED', 'CANCELED'])(
    'denies both history and sending for %s',
    async (status) => {
      prisma.walkRequest.findUnique.mockResolvedValue({
        requester,
        receiver,
        status,
      });
      await expect(service.findMessages(1, 10)).rejects.toThrow(
        '수락된 산책 요청에서만 채팅할 수 있어요.',
      );
      await expect(
        service.send(1, { walkRequestId: 10, content: 'hello' }),
      ).rejects.toThrow('수락된 산책 요청에서만 채팅할 수 있어요.');
      expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    },
  );

  it.each(['missing', 'outsider', 'out of range'])(
    'hides request details from %s before checking status',
    async (condition) => {
      prisma.walkRequest.findUnique.mockResolvedValue(
        condition === 'missing'
          ? null
          : { requester, receiver, status: 'PENDING' },
      );
      const userId = condition === 'outsider' ? 3 : 1;
      const walkRequestId = condition === 'out of range' ? 2147483648 : 10;
      await expect(service.findMessages(userId, walkRequestId)).rejects.toThrow(
        '산책 요청을 찾을 수 없어요.',
      );
      await expect(
        service.send(userId, { walkRequestId, content: 'hello' }),
      ).rejects.toThrow('산책 요청을 찾을 수 없어요.');
      expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    },
  );

  it.each([1, 500])(
    'trims and saves a %i-character message for either participant',
    async (length) => {
      const content = '가'.repeat(length);
      const stored = {
        id: 7,
        walkRequestId: 10,
        senderId: 2,
        content,
        createdAt: new Date(),
        sender: { nickname: receiver.nickname },
      };
      prisma.chatMessage.create.mockResolvedValue(stored);
      const result = await service.send(2, {
        walkRequestId: 10,
        content: ` \n${content}\t `,
      });
      expect(prisma.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { walkRequestId: 10, senderId: 2, content },
        }),
      );
      expect(result.participantIds).toEqual([1, 2]);
      expect(result.message).toEqual({
        id: 7,
        walkRequestId: 10,
        senderId: 2,
        content,
        createdAt: stored.createdAt,
        senderNickname: receiver.nickname,
      });
    },
  );

  it.each([1, 2])(
    'returns the counterpart for user %i and history in ascending order',
    async (userId) => {
      const messages = [3, 2, 1].map((id) => ({
        id,
        walkRequestId: 10,
        senderId: 1,
        content: `message ${id}`,
        createdAt: new Date(),
        sender: { nickname: requester.nickname },
      }));
      prisma.chatMessage.findMany.mockResolvedValue(messages);
      const result = await service.findMessages(userId, 10);
      expect(result.counterpart).toEqual(userId === 1 ? receiver : requester);
      expect(result.messages.map((message) => message.id)).toEqual([1, 2, 3]);
      expect(result.messages[0]).not.toHaveProperty('sender');
      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { walkRequestId: 10 },
          take: 50,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
    },
  );
});
