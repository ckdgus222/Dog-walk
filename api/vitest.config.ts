import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`. Requires Vite 8, which ships this option.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    env: {
      JWT_ACCESS_SECRET: 'test-only-access-secret',
      JWT_REFRESH_SECRET: 'test-only-refresh-secret',
      COOKIE_SECURE: 'false',
    },
    root: './',
    include: ['**/*.spec.ts'],
  },
});
