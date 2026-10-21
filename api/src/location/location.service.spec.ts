import {
  ConflictException,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import { LocationService } from './location.service.js';
import { UpdateLocationDto } from './dto/update-location.dto.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('LocationService', () => {
  const query = vi.fn();
  const findMany = vi.fn();
  const prisma = {
    $queryRaw: query,
    dog: { findMany },
  } as unknown as PrismaService;
  const service = new LocationService(prisma);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    [37.56651, 126.97801, 37.566, 126.978],
    [-37.5672, -126.9792, -37.568, -126.98],
    [0, 0, 0, 0],
    [90, 180, 90, 180],
    [-90, -180, -90, -180],
  ])(
    'sends rounded coordinates to PostGIS in longitude/latitude order (%s, %s)',
    async (lat, lng, roundedLat, roundedLng) => {
      const saved = { lat: roundedLat, lng: roundedLng, updatedAt: new Date() };
      query.mockResolvedValue([saved]);
      expect(await service.update(42, { lat, lng })).toEqual(saved);
      expect(query.mock.calls[0].slice(1)).toEqual([
        roundedLng,
        roundedLat,
        42,
      ]);
    },
  );

  it('rejects a save when the consent-conditional update returns no row', async () => {
    query.mockResolvedValue([]);
    await expect(service.update(42, { lat: 37, lng: 127 })).rejects.toThrow(
      ForbiddenException,
    );
  });

  const eightDaysAgo = () => new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

  it.each([
    [
      { consented: false, lat: null, lng: null, updatedAt: null },
      '먼저 내 위치를 저장해 주세요.',
    ],
    [
      { consented: true, lat: 37.566, lng: 126.978, updatedAt: eightDaysAgo() },
      '위치를 저장한 지 7일이 지났어요. 위치를 갱신해 주세요.',
    ],
  ])('rejects searches without a usable location', async (me, message) => {
    query.mockResolvedValueOnce([me]);
    await expect(service.findNearby(42)).rejects.toThrow(
      new ConflictException(message),
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('groups dogs by owner without exposing owner ids', async () => {
    const users = [
      {
        userId: 2,
        nickname: '보호자B',
        lat: 37.568,
        lng: 126.978,
        distanceM: 222,
      },
      {
        userId: 3,
        nickname: '보호자C',
        lat: 37.57,
        lng: 126.978,
        distanceM: 444,
      },
    ];
    query
      .mockResolvedValueOnce([
        { consented: true, lat: 37.566, lng: 126.978, updatedAt: new Date() },
      ])
      .mockResolvedValueOnce(users);
    findMany.mockResolvedValue([
      { id: 10, name: '보리', ownerId: 3 },
      { id: 11, name: '두부', ownerId: 2 },
      { id: 12, name: '콩이', ownerId: 3 },
    ]);
    expect(await service.findNearby(42)).toEqual([
      { ...users[0], dogs: [{ id: 11, name: '두부' }] },
      {
        ...users[1],
        dogs: [
          { id: 10, name: '보리' },
          { id: 12, name: '콩이' },
        ],
      },
    ]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});

describe('UpdateLocationDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const metadata = { type: 'body' as const, metatype: UpdateLocationDto };

  it.each([
    { lat: 91, lng: 0 },
    { lat: -91, lng: 0 },
    { lat: 0, lng: 181 },
    { lat: 0, lng: -181 },
    { lat: '37', lng: 127 },
    { lat: 37, lng: '127' },
    { lat: NaN, lng: 0 },
    { lat: 0, lng: Infinity },
    { lat: null, lng: 0 },
    { lat: 0 },
    { lng: 0 },
    { lat: 0, lng: 0, extra: true },
  ])('rejects invalid coordinates %j', async (input) => {
    await expect(pipe.transform(input, metadata)).rejects.toMatchObject({
      status: 400,
    });
  });

  it.each([
    { lat: 90, lng: 180 },
    { lat: -90, lng: -180 },
    { lat: 0, lng: 0 },
  ])('accepts inclusive boundaries %j', async (input) => {
    await expect(pipe.transform(input, metadata)).resolves.toEqual(input);
  });
});
