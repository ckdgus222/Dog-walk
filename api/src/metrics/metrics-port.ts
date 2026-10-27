export function metricsPort(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('METRICS_PORT must be an integer between 1 and 65535');
  }

  return port;
}
