import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService, type PublicUser } from '../users/users.service.js';
import type { SignupDto } from './dto/signup.dto.js';

const INVALID_CREDENTIALS = '이메일 또는 비밀번호가 올바르지 않습니다.';
const DUMMY_PASSWORD_HASH =
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {
    if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
      throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are required');
    }
    this.accessSecret = process.env.JWT_ACCESS_SECRET;
    this.refreshSecret = process.env.JWT_REFRESH_SECRET;
  }

  async signup(input: SignupDto): Promise<PublicUser> {
    const passwordHash = await bcrypt.hash(input.password, 10);
    try {
      return await this.prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          nickname: input.nickname,
          dogs: { create: input.dog },
        },
        select: { id: true, email: true, nickname: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Prisma's PostgreSQL adapter reports the constraint index instead of target.
        const adapterError = error.meta?.driverAdapterError as
          | {
              cause?: { constraint?: { fields?: string[]; index?: string } };
            }
          | undefined;
        const constraint = adapterError?.cause?.constraint;
        const target =
          error.meta?.target ?? constraint?.fields ?? constraint?.index;
        if (
          (Array.isArray(target) && target.includes('email')) ||
          target === 'users_email_key'
        ) {
          throw new ConflictException('이미 가입된 이메일입니다.');
        }
        if (
          (Array.isArray(target) && target.includes('nickname')) ||
          target === 'users_nickname_key'
        ) {
          throw new ConflictException('이미 사용 중인 닉네임입니다.');
        }
      }
      throw error;
    }
  }

  async validateUser(email: string, password: string): Promise<PublicUser> {
    const user = await this.users.findByEmail(email);
    const matches = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !matches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return { id: user.id, email: user.email, nickname: user.nickname };
  }

  async login(user: PublicUser) {
    const tokens = await this.issueTokens(user.id);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash: createHash('sha256')
          .update(tokens.refreshToken)
          .digest('hex'),
      },
    });
    return { ...tokens, user };
  }

  async refresh(token: string | undefined) {
    if (!token) throw new UnauthorizedException();
    let payload: { sub?: unknown; jti?: unknown };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.refreshSecret,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (
      typeof payload.sub !== 'number' ||
      !Number.isSafeInteger(payload.sub) ||
      payload.sub <= 0 ||
      typeof payload.jti !== 'string'
    ) {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub,
        refreshTokenHash: createHash('sha256').update(token).digest('hex'),
      },
      select: { id: true, email: true, nickname: true },
    });
    if (!user) throw new UnauthorizedException();
    const accessToken = await this.issueAccessToken(user.id);
    return { accessToken, user };
  }

  async verifyAccessToken(token: string) {
    let payload: { sub?: unknown; exp?: unknown };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.accessSecret,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (
      typeof payload.sub !== 'number' ||
      !Number.isSafeInteger(payload.sub) ||
      payload.sub <= 0 ||
      typeof payload.exp !== 'number' ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp * 1000 <= Date.now()
    ) {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, nickname: true },
    });
    if (!user) throw new UnauthorizedException();
    return { user, exp: payload.exp };
  }

  async logout(token: string | undefined) {
    if (token) {
      const hash = createHash('sha256').update(token).digest('hex');
      // Logging out also withdraws location consent. One statement, so a login
      // on another device cannot slip in between and lose its new location.
      await this.prisma.$executeRaw`
        UPDATE users SET refresh_token_hash = NULL, location = NULL,
          location_consented_at = NULL, location_updated_at = NULL
        WHERE refresh_token_hash = ${hash}
      `;
    }
  }

  private issueAccessToken(userId: number) {
    return this.jwt.signAsync(
      { sub: userId },
      {
        secret: this.accessSecret,
        expiresIn: '30m',
        algorithm: 'HS256',
      },
    );
  }

  private async issueTokens(userId: number) {
    const accessToken = await this.issueAccessToken(userId);
    const refreshToken = await this.jwt.signAsync(
      { sub: userId },
      {
        secret: this.refreshSecret,
        expiresIn: '7d',
        jwtid: randomUUID(),
        algorithm: 'HS256',
      },
    );
    return { accessToken, refreshToken };
  }
}
