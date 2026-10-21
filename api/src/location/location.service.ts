import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { publicDogSelect } from '../dogs/dogs.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateLocationDto } from './dto/update-location.dto.js';

type StoredLocation = { lat: number; lng: number; updatedAt: Date };
type NeighborRow = {
  userId: number;
  nickname: string;
  lat: number;
  lng: number;
  distanceM: number;
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class LocationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findMine(userId: number) {
    const [location] = await this.prisma.$queryRaw<
      {
        consented: boolean;
        lat: number | null;
        lng: number | null;
        updatedAt: Date | null;
      }[]
    >`
      SELECT location_consented_at IS NOT NULL AS consented,
        ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
        location_updated_at AS "updatedAt"
      FROM users WHERE id = ${userId}
    `;
    return location;
  }

  async consent(userId: number) {
    await this.prisma.user.updateMany({
      where: { id: userId, locationConsentedAt: null },
      data: { locationConsentedAt: new Date() },
    });
  }

  async withdraw(userId: number) {
    await this.prisma.$executeRaw`
      UPDATE users SET location = NULL, location_consented_at = NULL,
        location_updated_at = NULL WHERE id = ${userId}
    `;
  }

  async update(userId: number, input: UpdateLocationDto) {
    const lat = Number((Math.round(input.lat / 0.002) * 0.002).toFixed(3));
    const lng = Number((Math.round(input.lng / 0.002) * 0.002).toFixed(3));
    const [location] = await this.prisma.$queryRaw<StoredLocation[]>`
      UPDATE users SET
        location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        location_updated_at = now()
      WHERE id = ${userId} AND location_consented_at IS NOT NULL
      RETURNING ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
        location_updated_at AS "updatedAt"
    `;
    if (!location) throw new ForbiddenException('위치 수집에 동의해 주세요.');
    return location;
  }

  async findNearby(userId: number) {
    const me = await this.findMine(userId);
    if (me.lat === null || me.updatedAt === null) {
      throw new ConflictException('먼저 내 위치를 저장해 주세요.');
    }
    if (me.updatedAt.getTime() < Date.now() - SEVEN_DAYS_MS) {
      throw new ConflictException(
        '위치를 저장한 지 7일이 지났어요. 위치를 갱신해 주세요.',
      );
    }

    const neighbors = await this.prisma.$queryRaw<NeighborRow[]>`
      SELECT u.id AS "userId", u.nickname,
        ST_Y(u.location::geometry) AS lat, ST_X(u.location::geometry) AS lng,
        ROUND(ST_Distance(u.location, me.location))::integer AS "distanceM"
      FROM users u, users me
      WHERE me.id = ${userId} AND u.id <> me.id
        AND u.location_consented_at IS NOT NULL AND u.location IS NOT NULL
        AND u.location_updated_at > now() - interval '7 days'
        AND ST_DWithin(u.location, me.location, 1000)
      ORDER BY ST_Distance(u.location, me.location), u.id
    `;
    const dogs = await this.prisma.dog.findMany({
      where: { ownerId: { in: neighbors.map((row) => row.userId) } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { ...publicDogSelect, ownerId: true },
    });
    return neighbors.map(({ userId, nickname, lat, lng, distanceM }) => ({
      userId,
      nickname,
      lat,
      lng,
      distanceM,
      dogs: dogs
        .filter((dog) => dog.ownerId === userId)
        .map(({ ownerId: _ownerId, ...dog }) => dog),
    }));
  }
}
