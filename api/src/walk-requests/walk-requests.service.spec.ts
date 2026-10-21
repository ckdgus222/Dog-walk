import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { LocationService } from '../location/location.service.js';
import type { EventsGateway } from '../events/events.gateway.js';
import { WalkRequestsService } from './walk-requests.service.js';

describe('WalkRequestsService', () => {
  const create = vi.fn();
  const findFirst = vi.fn();
  const updateMany = vi.fn();
  const findUniqueOrThrow = vi.fn();
  const isNearby = vi.fn();
  const sendToUser = vi.fn();
  const prisma = {
    walkRequest: { create, findFirst, updateMany, findUniqueOrThrow },
  } as unknown as PrismaService;
  const service = new WalkRequestsService(
    prisma,
    { isNearby } as unknown as LocationService,
    { sendToUser } as unknown as EventsGateway,
  );
  const fields = {
    id: 10,
    status: 'PENDING',
    message: null,
    createdAt: new Date(),
    respondedAt: null,
  };
  const requester = { id: 1, nickname: '보호자A', dogs: [] };
  const receiver = { id: 2, nickname: '보호자B', dogs: [] };

  beforeEach(() => {
    vi.resetAllMocks();
    isNearby.mockResolvedValue(true);
    create.mockResolvedValue({ ...fields, requester, receiver });
    updateMany.mockResolvedValue({ count: 1 });
    findUniqueOrThrow.mockResolvedValue({
      ...fields,
      requesterId: 1,
      receiverId: 2,
    });
  });

  it('rejects self requests without creating or notifying', async () => {
    await expect(service.create(1, { receiverId: 1 })).rejects.toMatchObject({
      status: 400,
    });
    expect(isNearby).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(sendToUser).not.toHaveBeenCalled();
  });

  it('rejects non-neighbors without creating or notifying', async () => {
    isNearby.mockResolvedValue(false);
    await expect(service.create(1, { receiverId: 2 })).rejects.toMatchObject({
      status: 403,
    });
    expect(create).not.toHaveBeenCalled();
    expect(sendToUser).not.toHaveBeenCalled();
  });

  it.each([undefined, '', '  '])(
    'stores an empty message as null and sends the receiver perspective only after saving',
    async (message) => {
      await expect(
        service.create(1, { receiverId: 2, message }),
      ).resolves.toEqual({ ...fields, counterpart: receiver });
      expect(create.mock.calls[0][0].data).toEqual({
        requesterId: 1,
        receiverId: 2,
        message: null,
      });
      expect(sendToUser).toHaveBeenCalledExactlyOnceWith(
        2,
        'walk-request:received',
        { ...fields, counterpart: requester },
      );
    },
  );

  it.each([
    [null, 'ALREADY_PENDING'],
    [{ requesterId: 1 }, 'ALREADY_PENDING'],
    [{ requesterId: 2 }, 'REVERSE_PENDING'],
  ])(
    'handles a pending pair constraint even if the conflicting row is already processed',
    async (pending, code) => {
      create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: '7.10.1',
        }),
      );
      findFirst.mockResolvedValue(pending);
      await expect(service.create(1, { receiverId: 2 })).rejects.toMatchObject({
        status: 409,
        response: { code },
      });
      expect(sendToUser).not.toHaveBeenCalled();
    },
  );

  it('preserves unexpected save errors and never emits', async () => {
    const error = new Error('database unavailable');
    create.mockRejectedValue(error);
    await expect(service.create(1, { receiverId: 2 })).rejects.toBe(error);
    expect(sendToUser).not.toHaveBeenCalled();
  });

  it.each(['ACCEPTED', 'REJECTED', 'CANCELED'] as const)(
    'conditionally changes status to %s and notifies only the counterpart',
    async (status) => {
      const canceling = status === 'CANCELED';
      await expect(
        service.changeStatus(canceling ? 1 : 2, 10, status),
      ).resolves.toEqual({ id: 10, status });
      expect(updateMany).toHaveBeenCalledExactlyOnceWith({
        where: {
          id: 10,
          status: 'PENDING',
          ...(canceling ? { requesterId: 1 } : { receiverId: 2 }),
        },
        data: { status, respondedAt: canceling ? null : expect.any(Date) },
      });
      expect(sendToUser).toHaveBeenCalledExactlyOnceWith(
        canceling ? 2 : 1,
        'walk-request:changed',
        { id: 10, status },
      );
    },
  );

  it.each([
    [null, 404],
    [{ status: 'PENDING' }, 403],
    [{ status: 'CANCELED' }, 409],
  ])(
    'distinguishes hidden, forbidden, and processed requests without emitting',
    async (request, status) => {
      updateMany.mockResolvedValue({ count: 0 });
      findFirst.mockResolvedValue(request);
      await expect(
        service.changeStatus(1, 10, 'ACCEPTED'),
      ).rejects.toMatchObject({ status });
      expect(findFirst).toHaveBeenCalledExactlyOnceWith({
        where: { id: 10, OR: [{ requesterId: 1 }, { receiverId: 1 }] },
      });
      expect(sendToUser).not.toHaveBeenCalled();
    },
  );
});
