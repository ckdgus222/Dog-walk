import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = {
  ...process.env,
  JWT_ACCESS_SECRET: 'test-only-access-secret',
  JWT_REFRESH_SECRET: 'test-only-refresh-secret',
  COOKIE_SECURE: 'false',
  PUBLIC_UPLOAD_DIR: join(tmpdir(), 'dogwalk-e2e-uploads'),
  DATABASE_URL:
    process.env.DATABASE_URL ||
    'postgresql://dogwalk:dogwalk_local_only@localhost:5433/dogwalk_test',
};

for (const args of [
  ['node_modules/prisma/build/index.js', 'generate'],
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  [
    'node_modules/vitest/vitest.mjs',
    'run',
    '--config',
    './vitest.config.e2e.ts',
  ],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.error) {
    console.error('Could not start the e2e command:', result.error.message);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
