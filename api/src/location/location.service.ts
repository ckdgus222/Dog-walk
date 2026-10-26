import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { publicDogSelect } from '../dogs/dogs.service.js';
import { Prisma } from '../generated/prisma/client.js';
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

// Reuse this predicate for new location queries too: demo locations do not expire.
function usableLocation(alias: 'u' | 'me') {
  const table = Prisma.raw(alias);
  return Prisma.sql`(
    ${table}.location_consented_at IS NOT NULL
    AND ${table}.location IS NOT NULL
    AND (${table}.is_demo OR ${table}.location_updated_at > now() - interval '5 minutes')
  )`;
}

const nearbyLocations = Prisma.sql`
  ${usableLocation('me')} AND ${usableLocation('u')}
  AND u.is_demo = me.is_demo
  AND ST_DWithin(u.location, me.location, 1000)
`;

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

  async isNearby(userId: number, otherId: number): Promise<boolean> {
    const [result] = await this.prisma.$queryRaw<{ nearby: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM users u, users me
        WHERE me.id = ${userId} AND u.id = ${otherId} AND u.id <> me.id
          AND ${nearbyLocations}
      ) AS nearby
    `;
    return result.nearby;
  }

  async findNearby(userId: number) {
    const [me] = await this.prisma.$queryRaw<
      { lat: number | null; updatedAt: Date | null; usable: boolean }[]
    >`
      SELECT ST_Y(location::geometry) AS lat, location_updated_at AS "updatedAt",
        COALESCE(${usableLocation('me')}, false) AS usable
      FROM users me WHERE id = ${userId}
    `;
    if (me.lat === null || me.updatedAt === null) {
      throw new ConflictException('먼저 내 위치를 저장해 주세요.');
    }
    if (!me.usable) {
      throw new ConflictException(
        '내 위치가 5분 넘게 갱신되지 않았어요. 브라우저 위치 권한을 확인해 주세요.',
      );
    }

    const neighbors = await this.prisma.$queryRaw<NeighborRow[]>`
      SELECT u.id AS "userId", u.nickname,
        ST_Y(u.location::geometry) AS lat, ST_X(u.location::geometry) AS lng,
        ROUND(ST_Distance(u.location, me.location))::integer AS "distanceM"
      FROM users u, users me
      WHERE me.id = ${userId} AND u.id <> me.id
        AND ${nearbyLocations}
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
