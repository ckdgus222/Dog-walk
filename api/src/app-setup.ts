import { type INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import { Logger } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { pinoHttp } from 'pino-http';
import { pinoHttpOptions } from './logging/pino-http-options.js';
import { QuietClientErrorsFilter } from './logging/quiet-client-errors.filter.js';
import { requestMetrics } from './metrics/request-metrics.js';

export function setupApp(
  app: INestApplication,
  logDestination?: DestinationStream,
) {
  // Register before Nest adds body parsers so rejected bodies are logged too.
  app.use(pinoHttp(pinoHttpOptions(), logDestination));
  app.use(requestMetrics());
  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new QuietClientErrorsFilter(app.getHttpAdapter()));

  // Trust only the nearest proxy: nginx appends the actual client IP.
  const express = app.getHttpAdapter().getInstance() as Express;
  express.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
