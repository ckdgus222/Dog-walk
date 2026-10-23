import { LoginLimiter } from './login-limiter.js';

const WINDOW_MS = 15 * 60 * 1000;
const ip = '203.0.113.1';

describe('LoginLimiter', () => {
  let limiter: LoginLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    limiter = new LoginLimiter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function fail(count: number, address = ip) {
    for (let attempt = 0; attempt < count; attempt += 1) {
      expect(limiter.begin(address)).toBe(true);
      limiter.failed(address);
    }
  }

  it('locks an IP after five failures', () => {
    fail(5);
    expect(limiter.begin(ip)).toBe(false);
  });

  it('does not count successful logins or server errors', () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(limiter.begin(ip)).toBe(true);
      limiter.release(ip);
    }
  });

  it('does not clear earlier failures after a success', () => {
    fail(4);
    expect(limiter.begin(ip)).toBe(true);
    limiter.release(ip);
    fail(1);
    expect(limiter.begin(ip)).toBe(false);
  });

  it('unlocks exactly fifteen minutes after the fifth failure with a fresh count', () => {
    fail(4);
    vi.setSystemTime(60_000);
    fail(1);
    vi.advanceTimersByTime(WINDOW_MS - 1);
    expect(limiter.begin(ip)).toBe(false);
    vi.advanceTimersByTime(1);
    fail(4);
    expect(limiter.begin(ip)).toBe(true);
    limiter.failed(ip);
    expect(limiter.begin(ip)).toBe(false);
  });

  it('does not extend the failure window after a success', () => {
    fail(4);
    vi.setSystemTime(14 * 60_000);
    expect(limiter.begin(ip)).toBe(true);
    limiter.release(ip);
    vi.setSystemTime(16 * 60_000);
    fail(1);
    expect(limiter.begin(ip)).toBe(true);
  });

  it('isolates IP addresses', () => {
    fail(5);
    expect(limiter.begin('203.0.113.2')).toBe(true);
  });

  it('reserves only five concurrent attempts and does not lock on capacity alone', () => {
    const accepted = Array.from({ length: 10 }, () => limiter.begin(ip));
    expect(accepted.filter(Boolean)).toHaveLength(5);
    limiter.release(ip);
    expect(limiter.begin(ip)).toBe(true);
  });

  it('keeps the original record until a slow request finishes', () => {
    expect(limiter.begin(ip)).toBe(true);
    fail(4);
    vi.setSystemTime(16 * 60_000);
    fail(4);
    limiter.release(ip);
    fail(1);
    expect(limiter.begin(ip)).toBe(false);
  });

  it('expires old failures even when the password check crosses the window boundary', () => {
    fail(4);
    vi.setSystemTime(14 * 60_000 + 59_000);
    expect(limiter.begin(ip)).toBe(true);
    vi.setSystemTime(15 * 60_000 + 1_000);
    limiter.failed(ip);
    expect(limiter.begin(ip)).toBe(true);
  });

  it('expires a failure exactly at the window boundary', () => {
    fail(4);
    vi.setSystemTime(WINDOW_MS);
    fail(4);
    expect(limiter.begin(ip)).toBe(true);
  });

  it('cleans expired records above 1000 while preserving pending, recent, and locked records', () => {
    expect(limiter.begin(ip)).toBe(true);
    for (let index = 0; index < 1001; index += 1) {
      fail(1, `expired-${index}`);
    }
    vi.setSystemTime(WINDOW_MS - 1);
    fail(5, 'locked');
    fail(1, 'recent');
    vi.setSystemTime(WINDOW_MS);
    expect(limiter.begin('new')).toBe(true);

    // Inspect storage here because cleanup must reclaim entries, not just ignore them.
    expect([...limiter['records'].keys()].sort()).toEqual(
      [ip, 'locked', 'recent', 'new'].sort(),
    );
    expect(limiter['records'].get(ip)?.pending).toBe(1);
    expect(limiter.begin('locked')).toBe(false);
    fail(4, 'recent');
    expect(limiter.begin('recent')).toBe(false);
    limiter.release(ip);
    expect(limiter['records'].has(ip)).toBe(false);
  });

  it('clears all records between tests', () => {
    fail(5);
    limiter.clear();
    expect(limiter.begin(ip)).toBe(true);
  });

  it('ignores completions without a pending attempt', () => {
    limiter.release(ip);
    limiter.failed(ip);
    fail(4);
    limiter.release(ip);
    limiter.failed(ip);
    expect(limiter.begin(ip)).toBe(true);
    limiter.failed(ip);
    expect(limiter.begin(ip)).toBe(false);
  });
});
