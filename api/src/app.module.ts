import { DiariesModule } from './diaries/diaries.module.js';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { pinoHttpOptions } from './logging/pino-http-options.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { HealthModule } from './health/health.module.js';
import { DogsModule } from './dogs/dogs.module.js';
import { LocationModule } from './location/location.module.js';
import { EventsModule } from './events/events.module.js';
import { WalkRequestsModule } from './walk-requests/walk-requests.module.js';
import { ChatModule } from './chat/chat.module.js';
import { PostsModule } from './posts/posts.module.js';

@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: pinoHttpOptions(), useExisting: true }),
    HealthModule,
    AuthModule,
    UsersModule,
    DogsModule,
    LocationModule,
    EventsModule,
    WalkRequestsModule,
    ChatModule,
    DiariesModule,
    PostsModule,
  ],
})
export class AppModule {}
