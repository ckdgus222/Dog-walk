import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { HealthModule } from './health/health.module.js';
import { DogsModule } from './dogs/dogs.module.js';
import { LocationModule } from './location/location.module.js';
import { EventsModule } from './events/events.module.js';
import { WalkRequestsModule } from './walk-requests/walk-requests.module.js';

@Module({
  imports: [
    HealthModule,
    AuthModule,
    UsersModule,
    DogsModule,
    LocationModule,
    EventsModule,
    WalkRequestsModule,
  ],
})
export class AppModule {}
