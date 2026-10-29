import { HttpException, Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  type OnGatewayConnection,
  type OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, type Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service.js';
import { ChatService } from '../chat/chat.service.js';

@WebSocketGateway()
export class EventsGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ChatService) private readonly chat: ChatService,
  ) {}

  afterInit(server: Server) {
    server.use(async (socket, next) => {
      const token: unknown = socket.handshake.auth.token;
      if (typeof token !== 'string') return next(new Error('unauthorized'));
      try {
        const { user, exp } = await this.auth.verifyAccessToken(token);
        // The token may expire while the user lookup is still running.
        if (exp * 1000 <= Date.now()) return next(new Error('unauthorized'));
        socket.data.userId = user.id;
        socket.data.expiresAt = exp * 1000;
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });
  }

  handleConnection(socket: Socket) {
    void socket.join(`user:${socket.data.userId}`);
    const timer = setTimeout(
      () => socket.disconnect(true),
      socket.data.expiresAt - Date.now(),
    );
    socket.once('disconnect', () => clearTimeout(timer));
  }

  sendToUser(userId: number, event: string, payload: unknown) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  @SubscribeMessage('chat:send')
  async sendChat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown,
  ) {
    try {
      const { message, participantIds } = await this.chat.send(
        socket.data.userId,
        payload,
      );
      this.server
        .to(`user:${participantIds[0]}`)
        .to(`user:${participantIds[1]}`)
        .emit('chat:message', message);
      return { ok: true };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) {
        return { ok: false, message: error.message };
      }

      this.logger.error(error);
      return {
        ok: false,
        message: '메시지를 보내지 못했어요.',
      };
    }
  }
}
