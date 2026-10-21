import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { LocationModule } from '../location/location.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { WalkRequestsController } from './walk-requests.controller.js';
import { WalkRequestsService } from './walk-requests.service.js';

@Module({
  imports: [PrismaModule, LocationModule, EventsModule],
  controllers: [WalkRequestsController],
  providers: [WalkRequestsService],
})
export class WalkRequestsModule {}
