import { EventEmitter } from 'node:events';
import type { Server, Socket } from 'socket.io';
import type { AuthService } from '../auth/auth.service.js';
import type { ChatService } from '../chat/chat.service.js';
import { HttpException, Logger } from '@nestjs/common';
import { EventsGateway } from './events.gateway.js';

describe('EventsGateway', () => {
  const verifyAccessToken = vi.fn();
  const send = vi.fn();
  const gateway = new EventsGateway(
    { verifyAccessToken } as unknown as AuthService,
    { send } as unknown as ChatService,
  );
  let middleware: (
    socket: Socket,
    next: (error?: Error) => void,
  ) => Promise<void>;
  let socket: Socket;
  let disconnected: ReturnType<typeof vi.fn>;
  let joined: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    vi.setSystemTime(new Date('2026-10-21T00:00:00Z'));
    verifyAccessToken.mockResolvedValue({
      user: { id: 7 },
      exp: Date.now() / 1000 + 2,
    });
    gateway.afterInit({
      use: (callback: typeof middleware) => {
        middleware = callback;
      },
    } as unknown as Server);
    disconnected = vi.fn();
    joined = vi.fn();
    socket = Object.assign(new EventEmitter(), {
      handshake: { auth: { token: 'access-token' } },
      data: {},
      join: joined,
      disconnect: disconnected,
    }) as unknown as Socket;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each([undefined, null, 123])(
    'rejects non-string tokens before completing the handshake',
    async (token) => {
      socket.handshake.auth.token = token;
      const next = vi.fn();
      await middleware(socket, next);
      expect(next).toHaveBeenCalledExactlyOnceWith(new Error('unauthorized'));
      expect(verifyAccessToken).not.toHaveBeenCalled();
      expect(joined).not.toHaveBeenCalled();
    },
  );

  it('rejects failed verification through middleware, without accepting the socket', async () => {
    verifyAccessToken.mockRejectedValue(new Error('invalid token'));
    const next = vi.fn();
    await middleware(socket, next);
    expect(next).toHaveBeenCalledExactlyOnceWith(new Error('unauthorized'));
    expect(socket.data.userId).toBeUndefined();
  });

  it('rejects a token that expires while the user lookup is running', async () => {
    verifyAccessToken.mockResolvedValue({
      user: { id: 7 },
      exp: Date.now() / 1000,
    });
    const next = vi.fn();
    await middleware(socket, next);
    expect(next).toHaveBeenCalledExactlyOnceWith(new Error('unauthorized'));
  });

  it('joins only the verified user room and disconnects exactly at expiry', async () => {
    const next = vi.fn();
    await middleware(socket, next);
    expect(next).toHaveBeenCalledExactlyOnceWith();
    gateway.handleConnection(socket);
    expect(joined).toHaveBeenCalledExactlyOnceWith('user:7');
    await vi.advanceTimersByTimeAsync(1999);
    expect(disconnected).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(disconnected).toHaveBeenCalledExactlyOnceWith(true);
  });

  it.each([
    [
      new HttpException('산책 요청을 찾을 수 없어요.', 404),
      '산책 요청을 찾을 수 없어요.',
      false,
    ],
    [new Error('private database details'), '메시지를 보내지 못했어요.', true],
    [
      new HttpException('private server details', 500),
      '메시지를 보내지 못했어요.',
      true,
    ],
    ['unexpected failure', '메시지를 보내지 못했어요.', true],
    [{ reason: 'unexpected failure' }, '메시지를 보내지 못했어요.', true],
  ])(
    'returns an error ack without broadcasting when saving fails and logs only server errors',
    async (error, message, shouldLog) => {
      const logError = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});
      const to = vi.fn();
      Object.assign(gateway, { server: { to } });
      socket.data.userId = 7;
      send.mockRejectedValue(error);
      expect(
        await gateway.sendChat(socket, { walkRequestId: 1, content: 'hello' }),
      ).toEqual({ ok: false, message });
      expect(to).not.toHaveBeenCalled();
      expect(logError.mock.calls).toEqual(shouldLog ? [[error]] : []);
    },
  );

  it('broadcasts the saved message to the union of participant rooms before acknowledging', async () => {
    const logError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const emit = vi.fn();
    const to = vi.fn().mockReturnThis();
    Object.assign(gateway, { server: { to, emit } });
    const message = { id: 1, content: 'hello' };
    const payload = { walkRequestId: 10, content: ' hello ' };
    socket.data.userId = 7;
    send.mockResolvedValue({ message, participantIds: [7, 8] });
    expect(await gateway.sendChat(socket, payload)).toEqual({ ok: true });
    expect(send).toHaveBeenCalledExactlyOnceWith(7, payload);
    expect(to.mock.calls).toEqual([['user:7'], ['user:8']]);
    expect(emit).toHaveBeenCalledExactlyOnceWith('chat:message', message);
    expect(logError).not.toHaveBeenCalled();
  });

  it('clears the expiry timer when the connection closes early', async () => {
    await middleware(socket, vi.fn());
    gateway.handleConnection(socket);
    expect(vi.getTimerCount()).toBe(1);
    // The fake socket uses EventEmitter to exercise its disconnect listener.
    (socket as unknown as EventEmitter).emit('disconnect');
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(disconnected).not.toHaveBeenCalled();
  });
});
