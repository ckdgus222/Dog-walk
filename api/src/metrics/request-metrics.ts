import type { RequestHandler } from 'express';
import { httpRequestDuration } from './metrics.js';

export function requestMetrics(): RequestHandler {
  return (req, res, next) => {
    const endTimer = httpRequestDuration.startTimer();

    res.on('finish', () => {
      const path: unknown = req.route?.path;
      // Nest registers *path for its not-found handler. Express leaves
      // baseUrl undefined once an error has left the router.
      const route =
        typeof path === 'string' && path !== '*path'
          ? `${req.baseUrl ?? ''}${path}`
          : 'unmatched';

      endTimer({
        method: req.method,
        route,
        status_code: String(res.statusCode),
      });
    });

    next();
  };
}
