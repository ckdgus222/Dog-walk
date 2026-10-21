import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DogsController } from './dogs.controller.js';
import { DogsService } from './dogs.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [DogsController],
  providers: [DogsService],
})
export class DogsModule {}
