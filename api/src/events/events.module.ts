import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ChatModule } from '../chat/chat.module.js';
import { EventsGateway } from './events.gateway.js';

@Module({
  imports: [AuthModule, ChatModule],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
