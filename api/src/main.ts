import { NestFactory } from '@nestjs/core';
import { setupApp } from './app-setup.js';
import { AppModule } from './app.module.js';
import { metricsPort } from './metrics/metrics-port.js';
import { startMetricsServer } from './metrics/metrics-server.js';

async function bootstrap() {
  const port = metricsPort(process.env.METRICS_PORT);
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  setupApp(app);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 4000);
  if (port !== undefined) startMetricsServer(port);
}
await bootstrap();
