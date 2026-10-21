import { Inject } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, type Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service.js';

@WebSocketGateway()
export class EventsGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  private server!: Server;

  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

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
}
