import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertE2eDatabaseUrl } from './e2e-database.mjs';

const invalidAddressMessage =
  'e2e DB 주소를 읽을 수 없어요. postgresql://<사용자>:<비밀번호>@<호스트>:<포트>/<이름>_test 형식으로 적어 주세요.';
const apiRoot = fileURLToPath(new URL('../', import.meta.url));

describe('e2e database guard', () => {
  it.each([
    'postgresql://u:secret@127.0.0.1:5433/dogwalk_test',
    'postgres://u:secret@h/dogwalk_test?schema=public',
    'postgresql://u:secret@h/feature_test',
    'postgresql://h/dogwalk%5Ftest',
    'postgresql://h/dogwalk_test?database=dogwalk&dbname=dogwalk',
  ])('accepts a test database: %s', (url) => {
    expect(() => assertE2eDatabaseUrl(url)).not.toThrow();
  });

  it.each(['dogwalk', 'dogwalk_test_backup'])(
    'rejects a non-test database without exposing credentials: %s',
    (databaseName) => {
      expect(() =>
        assertE2eDatabaseUrl(`postgresql://u:secret@h/${databaseName}`),
      ).toThrow(
        new Error(
          `e2e는 이름이 _test로 끝나는 DB에서만 실행해요: ${databaseName}`,
        ),
      );
    },
  );

  it.each([
    undefined,
    '',
    'not a url',
    'socket:/var/run/postgresql_test?db=dogwalk',
    'postgresql:/u:secret@h:5433/dogwalk_test',
    'postgresql://u:secret@h:5433/',
    'postgresql://u:secret@h:5433/a/b_test',
    'https://h/dogwalk_test',
    'postgresql:/dogwalk_test',
    'postgresql://h',
    'postgresql://h/a/b_test',
    'postgresql://h/a%2Fb_test',
    'postgresql://u:secret@h/%ZZ_test',
  ])('rejects a malformed address with only the fixed message: %s', (url) => {
    expect(() => assertE2eDatabaseUrl(url)).toThrow(
      new Error(invalidAddressMessage),
    );
  });

  describe.each([
    {
      url: 'postgresql://u:secret@127.0.0.1:1/dogwalk',
      message: 'e2e는 이름이 _test로 끝나는 DB에서만 실행해요: dogwalk',
    },
    {
      url: 'postgresql:/u:secret@127.0.0.1:1/dogwalk_test',
      message: invalidAddressMessage,
    },
  ])('entry points with $url', ({ url, message }) => {
    it('stops the runner before Prisma starts', () => {
      const result = spawnSync(process.execPath, ['test/run-e2e.mjs'], {
        cwd: apiRoot,
        env: { ...process.env, DATABASE_URL: url },
        encoding: 'utf8',
        timeout: 10_000,
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toBe(`${message}\n`);
      expect(result.stdout).toBe('');
      expect(result.stdout + result.stderr).not.toMatch(/secret|Prisma/i);
    });

    it('stops direct Vitest execution while loading the config', () => {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/vitest/vitest.mjs',
          'run',
          '--config',
          'vitest.config.e2e.ts',
        ],
        {
          cwd: apiRoot,
          env: { ...process.env, DATABASE_URL: url },
          encoding: 'utf8',
          timeout: 10_000,
        },
      );

      expect(result.error).toBeUndefined();
      expect(result.status).not.toBeNull();
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(message);
      expect(result.stdout + result.stderr).not.toContain('secret');
    });
  });
});
