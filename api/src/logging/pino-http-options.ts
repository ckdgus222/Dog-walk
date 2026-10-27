import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';
import type { PublicUser } from '../users/users.service.js';

export function pinoHttpOptions(): Options {
  return {
    level: process.env.LOG_LEVEL ?? 'info',
    genReqId: () => randomUUID(),
    serializers: {
      req: (req: Pick<IncomingMessage, 'id' | 'method' | 'url'>) => ({
        id: req.id,
        method: req.method,
        url: req.url?.split('?')[0],
      }),
      res: (res: Pick<ServerResponse, 'statusCode'>) => ({
        statusCode: res.statusCode,
      }),
    },
    customProps: (req) => {
      const user = (req as IncomingMessage & { user?: PublicUser }).user;
      return user ? { userId: user.id } : {};
    },
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  };
}
