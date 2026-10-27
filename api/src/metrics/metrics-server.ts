import { createServer, type Server } from 'node:http';
import { register } from './metrics.js';

export function startMetricsServer(port: number): Server {
  const server = createServer(async (req, res) => {
    if (req.method !== 'GET' || req.url !== '/metrics') {
      res.writeHead(404).end();
      return;
    }

    try {
      const metrics = await register.metrics();
      res.writeHead(200, { 'Content-Type': register.contentType }).end(metrics);
    } catch {
      res.writeHead(500).end();
    }
  });

  return server.listen(port);
}
