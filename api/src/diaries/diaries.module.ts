import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DiariesController } from './diaries.controller.js';
import { DiariesService } from './diaries.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [DiariesController],
  providers: [DiariesService],
})
export class DiariesModule {}
