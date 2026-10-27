import {
  BadRequestException,
  Body,
  Controller,
  Get,
  type INestApplication,
  Logger,
  Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { setupApp } from '../app-setup.js';
import { pinoHttpOptions } from './pino-http-options.js';

@Controller('echo')
class EchoController {
  @Post()
  echo(@Body() body: Record<string, unknown>) {
    new Logger('Echo').log('inside');
    return body;
  }

  @Get('error')
  error() {
    throw new Error('boom');
  }

  @Get('bad-request')
  badRequest() {
    throw new BadRequestException('invalid input');
  }

  @Get('status-only')
  statusOnly() {
    throw Object.assign(new Error('internal detail'), { statusCode: 400 });
  }

  @Get('hidden-error')
  hiddenError() {
    throw Object.assign(new Error('hidden detail'), {
      status: 400,
      statusCode: 400,
      expose: false,
    });
  }

  @Get('server-http-error')
  serverHttpError() {
    throw Object.assign(new Error('server detail'), {
      status: 500,
      statusCode: 500,
      expose: false,
    });
  }
}

interface LogEntry {
  level: number;
  context?: string;
  msg?: string;
  req?: { id: string; method: string; url: string };
  res?: { statusCode: number };
  err?: { message: string; stack: string };
}

describe('request logging through setupApp', () => {
  let app: INestApplication<App>;
  const lines: string[] = [];
  const logs: LogEntry[] = [];
  const destination: DestinationStream = {
    write: (line) => {
      lines.push(line);
      logs.push(JSON.parse(line) as LogEntry);
    },
  };

  beforeAll(async () => {
    vi.stubEnv('LOG_LEVEL', 'info');
    const module = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot({
          pinoHttp: [pinoHttpOptions(), destination],
          useExisting: true,
        }),
      ],
      controllers: [EchoController],
    }).compile();

    app = module.createNestApplication();
    setupApp(app, destination);
    await app.init();
  });

  beforeEach(() => {
    lines.length = 0;
    logs.length = 0;
  });

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  // The only line is the request result, so no Nest error log was written.
  function expectOnlyResult(statusCode: number) {
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ level: 40, res: { statusCode } });
  }

  // Exactly one request result, plus Nest's error log for the server error.
  function expectServerError(err: Partial<LogEntry['err']>) {
    const results = logs.filter((log) => log.res);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ level: 50, res: { statusCode: 500 } });
    expect(
      logs.find((log) => log.context === 'ExceptionsHandler'),
    ).toMatchObject({ level: 50, err });
  }

  it('logs exactly one result when the JSON body is malformed', async () => {
    await request(app.getHttpServer())
      .post('/api/echo')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);

    expectOnlyResult(400);
  });

  it('logs exactly one result without a Nest error for a body over 100kb', async () => {
    await request(app.getHttpServer())
      .post('/api/echo')
      .send({ value: 'x'.repeat(101 * 1024) })
      .expect(413);

    expectOnlyResult(413);
  });

  it('shares the request ID with Nest logs and writes only one result', async () => {
    await request(app.getHttpServer())
      .post('/api/echo')
      .send({ value: 'hello' })
      .expect(201)
      .expect({ value: 'hello' });

    const results = logs.filter((log) => log.res);
    const inside = logs.filter((log) => log.msg === 'inside');
    expect(results).toHaveLength(1);
    expect(inside).toHaveLength(1);
    expect(results[0]).toMatchObject({
      req: { id: expect.any(String), method: 'POST', url: '/api/echo' },
      res: { statusCode: 201 },
    });
    expect(inside[0]).toMatchObject({
      context: 'Echo',
      req: { id: results[0].req!.id },
    });
  });

  it('preserves the 415 response without leaking the charset into any log', async () => {
    await request(app.getHttpServer())
      .post('/api/echo')
      .set('Content-Type', 'application/json; charset=SECRET415')
      .send('{}')
      .expect(415)
      .expect({
        statusCode: 415,
        message: 'unsupported charset "SECRET415"',
      });

    expect(lines.join('').toLowerCase()).not.toContain('secret415');
    expectOnlyResult(415);
  });

  it('keeps the Nest error message and stack for an ordinary server error', async () => {
    await request(app.getHttpServer())
      .get('/api/echo/error')
      .expect(500)
      .expect({ statusCode: 500, message: 'Internal server error' });

    expectServerError({
      message: 'boom',
      stack: expect.stringContaining('Error: boom'),
    });
  });

  it('preserves BadRequestException responses without a Nest error log', async () => {
    await request(app.getHttpServer())
      .get('/api/echo/bad-request')
      .expect(400)
      .expect({
        statusCode: 400,
        message: 'invalid input',
        error: 'Bad Request',
      });

    expectOnlyResult(400);
  });

  it('keeps a plain Error with only statusCode as a logged 500', async () => {
    await request(app.getHttpServer())
      .get('/api/echo/status-only')
      .expect(500)
      .expect({ statusCode: 500, message: 'Internal server error' });

    expectServerError({ message: 'internal detail' });
  });

  it('preserves expose:false for client errors without logging their details', async () => {
    await request(app.getHttpServer())
      .get('/api/echo/hidden-error')
      .expect(400)
      .expect({ statusCode: 400, message: 'Bad Request' });

    expectOnlyResult(400);
    expect(lines.join('')).not.toContain('hidden detail');
  });

  it('keeps Nest error logs for http-errors with status 500', async () => {
    await request(app.getHttpServer())
      .get('/api/echo/server-http-error')
      .expect(500)
      .expect({ statusCode: 500, message: 'Internal Server Error' });

    expectServerError({ message: 'server detail' });
  });
});
