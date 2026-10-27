import {
  Body,
  Controller,
  Get,
  type INestApplication,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { setupApp } from '../app-setup.js';
import { pinoHttpOptions } from '../logging/pino-http-options.js';
import { httpRequestDuration, register } from './metrics.js';

@Controller('things')
class ThingsController {
  @Get(':id')
  get(@Param('id') id: string) {
    if (id === 'missing') throw new NotFoundException();
    return { id };
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return body;
  }
}

describe('request metrics through setupApp', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    httpRequestDuration.reset();
    const module = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot({
          pinoHttp: pinoHttpOptions(),
          useExisting: true,
        }),
      ],
      controllers: [ThingsController],
    }).compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
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

  it('maps the Nest *path fallback to unmatched', async () => {
    const paths = [`/api/nope-${randomUUID()}`, `/api/nope-${randomUUID()}`];
    for (const path of paths)
      await request(app.getHttpServer()).get(path).expect(404);

    const metrics = await register.getSingleMetricAsString(
      'http_request_duration_seconds',
    );
    expect(await countLines()).toEqual([
      'http_request_duration_seconds_count{method="GET",route="unmatched",status_code="404"} 2',
    ]);
    expect(metrics).not.toContain('*path');
    for (const path of paths) expect(metrics).not.toContain(path);
  });

  it('preserves the matched route when its controller returns 404', async () => {
    await request(app.getHttpServer()).get('/api/things/missing').expect(404);

    expect(await countLines()).toContain(
      'http_request_duration_seconds_count{method="GET",route="/api/things/:id",status_code="404"} 1',
    );
  });

  it('records the matched Nest route for successful responses', async () => {
    await request(app.getHttpServer()).get('/api/things/1').expect(200);

    expect(await countLines()).toContain(
      'http_request_duration_seconds_count{method="GET",route="/api/things/:id",status_code="200"} 1',
    );
  });

  it('does not expose metrics on the application server', async () => {
    await request(app.getHttpServer()).get('/api/metrics').expect(404);
  });

  it.each([
    { status: 400, contentType: 'application/json', body: '{' },
    {
      status: 413,
      contentType: 'application/json',
      body: JSON.stringify({ value: 'x'.repeat(101 * 1024) }),
    },
    {
      status: 415,
      contentType: 'application/json; charset=unsupported',
      body: '{}',
    },
  ])(
    'records bodies rejected with $status before routing',
    async ({ status, contentType, body }) => {
      await request(app.getHttpServer())
        .post('/api/things')
        .set('Content-Type', contentType)
        .send(body)
        .expect(status);

      expect(await countLines()).toContain(
        `http_request_duration_seconds_count{method="POST",route="unmatched",status_code="${status}"} 1`,
      );
    },
  );
});
