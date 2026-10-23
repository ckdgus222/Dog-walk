import { type INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';

export function setupApp(app: INestApplication) {
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
