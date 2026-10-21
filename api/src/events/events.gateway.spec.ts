import { EventEmitter } from 'node:events';
import type { Server, Socket } from 'socket.io';
import type { AuthService } from '../auth/auth.service.js';
import { EventsGateway } from './events.gateway.js';

describe('EventsGateway', () => {
  const verifyAccessToken = vi.fn();
  const gateway = new EventsGateway({
    verifyAccessToken,
  } as unknown as AuthService);
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
