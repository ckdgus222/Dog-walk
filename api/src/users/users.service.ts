import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PASSWORD_HASH_ROUNDS } from '../common/account-rules.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  isRecordNotFoundError,
  isUniqueConstraintError,
} from '../prisma/prisma-errors.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';

export interface PublicUser {
  id: number;
  email: string;
  nickname: string;
}

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findPublicById(id: number): Promise<PublicUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, nickname: true },
    });
  }

  // A new password is saved together with the hash of a fresh refresh token
  // (refreshTokenHash), in one update, so no refresh token issued before the
  // change keeps working.
  async update(
    id: number,
    input: UpdateUserDto,
    refreshTokenHash?: string,
  ): Promise<PublicUser> {
    if (input.nickname === undefined && input.newPassword === undefined) {
      throw new BadRequestException('닉네임이나 새 비밀번호를 입력해 주세요.');
    }

    const data: {
      nickname?: string;
      passwordHash?: string;
      refreshTokenHash?: string;
    } = {};
    if (input.nickname !== undefined) data.nickname = input.nickname;
    // The hash that was checked; the save is refused if it changed since.
    let verifiedPasswordHash: string | undefined;
    if (input.newPassword !== undefined) {
      if (input.currentPassword === undefined) {
        throw new BadRequestException('현재 비밀번호를 입력해 주세요.');
      }
      const user = await this.prisma.user.findUnique({
        where: { id },
        select: { passwordHash: true },
      });
      if (
        !user ||
        !(await bcrypt.compare(input.currentPassword, user.passwordHash))
      ) {
        throw new BadRequestException('현재 비밀번호가 맞지 않아요.');
      }
      if (refreshTokenHash === undefined) {
        throw new Error('A password change needs a new refresh token.');
      }
      data.passwordHash = await bcrypt.hash(
        input.newPassword,
        PASSWORD_HASH_ROUNDS,
      );
      data.refreshTokenHash = refreshTokenHash;
      verifiedPasswordHash = user.passwordHash;
    }

    try {
      return await this.prisma.user.update({
        where: { id, passwordHash: verifiedPasswordHash },
        data,
        select: { id: true, email: true, nickname: true },
      });
    } catch (error) {
      if (isUniqueConstraintError(error, 'nickname', 'users_nickname_key')) {
        throw new ConflictException('이미 사용 중인 닉네임이에요.');
      }
      // Another request changed the password after it was checked here.
      if (verifiedPasswordHash !== undefined && isRecordNotFoundError(error)) {
        throw new BadRequestException('현재 비밀번호가 맞지 않아요.');
      }
      throw error;
    }
  }
}
