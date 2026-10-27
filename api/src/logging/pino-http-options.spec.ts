import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { pinoHttpOptions } from './pino-http-options.js';

interface RequestLog {
  level: number;
  req: { id: string; method: string; url: string };
  res: { statusCode: number };
  responseTime: number;
  userId?: number;
}

describe('pinoHttpOptions', () => {
  let app: Express;
  let lines: string[];
  let logs: RequestLog[];

  beforeEach(() => {
    lines = [];
    logs = [];
    app = express();
    app.use((req, _res, next) => {
      if (req.path === '/authenticated') req.user = { id: 7 };
      next();
    });
    app.use(
      pinoHttp(
        { ...pinoHttpOptions(), level: 'info' },
        {
          write: (line) => {
            lines.push(line);
            logs.push(JSON.parse(line) as RequestLog);
          },
        },
      ),
    );
    app.use(express.json());
    app.get('/authenticated', (_req, res) => res.sendStatus(200));
    app.get('/late-user', (req, res) => {
      req.user = { id: 7 };
      res.sendStatus(200);
    });
    app.post('/x', (_req, res) => {
      res.setHeader('Set-Cookie', 'refresh_token=test-response-cookie');
      res.sendStatus(200);
    });
    app.get('/x', (_req, res) => res.sendStatus(200));
    app.get('/status/:status', (req, res) => {
      res.sendStatus(Number(req.params.status));
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('uses info by default and respects LOG_LEVEL', () => {
    vi.stubEnv('LOG_LEVEL', undefined);
    expect(pinoHttpOptions().level).toBe('info');
    vi.stubEnv('LOG_LEVEL', 'warn');
    expect(pinoHttpOptions().level).toBe('warn');
  });

  it('writes one result with a UUID, timing, and authenticated user ID', async () => {
    await request(app).get('/authenticated').expect(200);

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      req: {
        id: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
        method: 'GET',
        url: '/authenticated',
      },
      res: { statusCode: 200 },
      responseTime: expect.any(Number),
      userId: 7,
    });
    expect(logs[0].responseTime).toBeGreaterThanOrEqual(0);
  });

  it('keeps only allowed request and response fields without secrets or IPs', async () => {
    await request(app)
      .post('/x')
      .set('Authorization', 'Bearer test-access-token')
      .set('Cookie', 'refresh_token=test-refresh-cookie')
      .set('X-Forwarded-For', '203.0.113.42')
      .send({ password: 'test-private-password', lat: 37.51 })
      .expect(200);

    expect(logs).toHaveLength(1);
    expect(Object.keys(logs[0].req).sort()).toEqual(['id', 'method', 'url']);
    expect(logs[0].res).toEqual({ statusCode: 200 });
    for (const privateValue of [
      'test-access-token',
      'test-refresh-cookie',
      'test-response-cookie',
      'test-private-password',
      '203.0.113.42',
      '127.0.0.1',
      '37.51',
    ]) {
      expect(lines.join('')).not.toContain(privateValue);
    }
  });

  it('removes the entire query string from the logged URL', async () => {
    await request(app).get('/x?token=test-query-token&lat=37.51').expect(200);

    expect(logs).toHaveLength(1);
    expect(logs[0].req.url).toBe('/x');
    expect(lines.join('')).not.toContain('test-query-token');
    expect(lines.join('')).not.toContain('37.51');
  });

  it('ignores client request IDs and generates a different ID for each request', async () => {
    await request(app).get('/x').set('X-Request-Id', 'fixed').expect(200);
    await request(app).get('/x').set('X-Request-Id', 'fixed').expect(200);

    expect(logs).toHaveLength(2);
    expect(logs[0].req.id).not.toBe('fixed');
    expect(logs[1].req.id).not.toBe('fixed');
    expect(logs[0].req.id).not.toBe(logs[1].req.id);
  });

  it.each([200, 401])(
    'omits userId on an unauthenticated %i response',
    async (status) => {
      await request(app).get(`/status/${status}`).expect(status);

      expect(logs).toHaveLength(1);
      expect(logs[0]).not.toHaveProperty('userId');
    },
  );

  it.each([
    [200, 30],
    [399, 30],
    [400, 40],
    [404, 40],
    [499, 40],
    [500, 50],
  ])('logs status %i at level %i', async (status, level) => {
    await request(app).get(`/status/${status}`).expect(status);

    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe(level);
  });

  it('reads the user assigned inside the route before responding', async () => {
    await request(app).get('/late-user').expect(200);

    expect(logs).toHaveLength(1);
    expect(logs[0].userId).toBe(7);
  });
});
