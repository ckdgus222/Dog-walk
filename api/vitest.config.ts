import { defineConfig } from 'vitest/config';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  // Resolves path aliases declared in tsconfig.json.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    env: {
      JWT_ACCESS_SECRET: 'test-only-access-secret',
      JWT_REFRESH_SECRET: 'test-only-refresh-secret',
      COOKIE_SECURE: 'false',
      PRIVATE_UPLOAD_DIR: join(tmpdir(), 'dogwalk-unit-private-uploads'),
      PUBLIC_UPLOAD_DIR: join(tmpdir(), 'dogwalk-unit-uploads'),
    },
    root: './',
    include: ['**/*.spec.ts'],
  },
});
