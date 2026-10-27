import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import express, { type Request, type Response } from 'express';
import request from 'supertest';
import { httpRequestDuration, register } from './metrics.js';
import { requestMetrics } from './request-metrics.js';

describe('requestMetrics', () => {
  beforeEach(() => {
    httpRequestDuration.reset();
  });

  // One _count line per label set, so these show which series were recorded.
  async function countLines() {
    const metrics = await register.getSingleMetricAsString(
      'http_request_duration_seconds',
    );
    return metrics
      .split('\n')
      .filter((line) => line.startsWith('http_request_duration_seconds_count'));
  }

  it('groups requests by route pattern without exposing actual paths', async () => {
    const app = express();
    app.use(requestMetrics());
    app.get('/api/dogs/:id', (_req, res) => res.sendStatus(200));

    await request(app).get('/api/dogs/1').expect(200);
    await request(app).get('/api/dogs/2').expect(200);

    const metrics = await register.getSingleMetricAsString(
      'http_request_duration_seconds',
    );
    expect(await countLines()).toEqual([
      'http_request_duration_seconds_count{method="GET",route="/api/dogs/:id",status_code="200"} 2',
    ]);
    expect(metrics).not.toContain('/api/dogs/1');
    expect(metrics).not.toContain('/api/dogs/2');
  });

  it('includes the router base URL in the route label', async () => {
    const app = express();
    const router = express.Router();
    app.use(requestMetrics());
    router.get('/dogs/:id', (_req, res) => res.sendStatus(200));
    app.use('/api', router);

    await request(app).get('/api/dogs/1').expect(200);

    expect(await countLines()).toContain(
      'http_request_duration_seconds_count{method="GET",route="/api/dogs/:id",status_code="200"} 1',
    );
  });

  it('groups unknown paths under unmatched', async () => {
    const app = express();
    app.use(requestMetrics());
    const paths = [`/api/nope-${randomUUID()}`, `/api/nope-${randomUUID()}`];

    for (const path of paths) await request(app).get(path).expect(404);

    const metrics = await register.getSingleMetricAsString(
      'http_request_duration_seconds',
    );
    expect(await countLines()).toEqual([
      'http_request_duration_seconds_count{method="GET",route="unmatched",status_code="404"} 2',
    ]);
    for (const path of paths) expect(metrics).not.toContain(path);
  });

  it('records malformed JSON rejected before routing', async () => {
    const app = express();
    app.use(requestMetrics());
    app.use(express.json());
    app.post('/api/echo', (_req, res) => res.sendStatus(200));

    await request(app)
      .post('/api/echo')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);

    expect(await countLines()).toContain(
      'http_request_duration_seconds_count{method="POST",route="unmatched",status_code="400"} 1',
    );
  });

  it('records server errors with status 500', async () => {
    const app = express();
    app.use(requestMetrics());
    app.get('/api/error', () => {
      throw new Error('boom');
    });

    await request(app).get('/api/error').expect(500);

    expect(await countLines()).toContain(
      'http_request_duration_seconds_count{method="GET",route="/api/error",status_code="500"} 1',
    );
  });

  describe('without HTTP', () => {
    it('does not register metrics again when attaching to two apps', () => {
      const metric = register.getSingleMetric('http_request_duration_seconds');
      expect(() => {
        express().use(requestMetrics());
        express().use(requestMetrics());
      }).not.toThrow();
      expect(register.getSingleMetric('http_request_duration_seconds')).toBe(
        metric,
      );
    });

    it('does not record connections closed without a finished response', async () => {
      const res = new EventEmitter();
      const next = vi.fn();
      requestMetrics()(
        { method: 'GET', baseUrl: '' } as Request,
        res as Response,
        next,
      );

      res.emit('close');

      expect(next).toHaveBeenCalledOnce();
      expect(await countLines()).toEqual([]);
    });
  });
});
