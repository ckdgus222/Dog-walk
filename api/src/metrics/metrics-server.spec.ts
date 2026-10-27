import { once } from 'node:events';
import type { Server } from 'node:http';
import request from 'supertest';
import { startMetricsServer } from './metrics-server.js';
import { httpRequestDuration, register } from './metrics.js';

describe('metrics server', () => {
  let server: Server;

  beforeEach(async () => {
    httpRequestDuration.reset();
    server = startMetricsServer(0);
    await once(server, 'listening');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (!server?.listening) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) return reject(error);
        resolve();
      });
    });
  });

  it('exports HTTP and Node metrics with the registry content type', async () => {
    const response = await request(server).get('/metrics').expect(200);

    expect(response.headers['content-type']).toBe(register.contentType);
    expect(response.text).toContain('http_request_duration_seconds');
    expect(response.text).toContain('process_resident_memory_bytes');
    expect(response.text).not.toContain('http_request_duration_seconds_count{');
  });

  it('rejects other paths', async () => {
    await request(server).get('/').expect(404);
  });

  it('rejects methods other than GET', async () => {
    await request(server).post('/metrics').expect(404);
    await request(server).head('/metrics').expect(404);
  });

  it('returns 500 if collecting metrics fails', async () => {
    vi.spyOn(register, 'metrics').mockRejectedValueOnce(
      new Error('collection failed'),
    );

    await request(server).get('/metrics').expect(500).expect('');
    await request(server).get('/metrics').expect(200);
  });
});
