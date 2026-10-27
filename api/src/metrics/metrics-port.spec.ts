import { metricsPort } from './metrics-port.js';

describe('metricsPort', () => {
  it('does not open a port when METRICS_PORT is absent', () => {
    expect(metricsPort(undefined)).toBeUndefined();
  });

  it.each(['1', '9464', '65535'])('accepts port %s', (value) => {
    expect(metricsPort(value)).toBe(Number(value));
  });

  it.each(['0', '-1', '65536', '70000', 'abc', '94.5', '', ' ', 'Infinity'])(
    'rejects invalid port %j',
    (value) => {
      expect(() => metricsPort(value)).toThrow(
        'METRICS_PORT must be an integer between 1 and 65535',
      );
    },
  );
});
