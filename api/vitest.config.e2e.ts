import { defineConfig } from 'vitest/config';
import { assertE2eDatabaseUrl } from './test/e2e-database.mjs';

assertE2eDatabaseUrl(process.env.DATABASE_URL);

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    env: { LOG_LEVEL: 'silent' },
    fileParallelism: false,
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
