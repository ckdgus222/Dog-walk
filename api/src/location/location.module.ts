import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LocationController } from './location.controller.js';
import { LocationService } from './location.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [LocationController],
  providers: [LocationService],
  exports: [LocationService],
})
export class LocationModule {}
