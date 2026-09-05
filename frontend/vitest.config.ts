// frontend/vitest.config.ts — minimal config; default test discovery.
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // Final bulletin-pages-engine fix wave: BulletinPage.test.ts renders a
  // real .tsx component (react-dom/server) to cover the halves-layout CSS
  // columns bug. No test in this repo has imported a .tsx module before
  // (tsconfig.json's `jsx: "preserve"` defers JSX transform to Next's own
  // compiler, which Vitest doesn't run), so esbuild's default classic
  // transform failed with "React is not defined". `jsx: 'automatic'` only
  // affects files that actually contain JSX syntax, so this has no effect
  // on the rest of the suite (nothing else imports a .tsx module today).
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    // Phase 3 Wave 0: extend include glob so scripts/*.test.ts (e.g.
    // make-superadmin) is discovered alongside src/. Vitest 2 supports
    // multiple globs; both are scoped under `frontend/` via cwd.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
    // Wave 0 ships this config before any test files exist (Wave 1 plans add them).
    // Without this, Vitest 2.x exits 1 on zero tests, blocking the plan's own
    // acceptance criterion ("`pnpm --filter frontend test` exits 0").
    passWithNoTests: true,
    // Phase 1 D-27: setupFile sets JWT_SECRET / ENCRYPTION_KEY before any
    // test module imports `@/lib/server/auth` (which throws at import time
    // when JWT_SECRET is missing or < 32 chars).
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // The `server-only` package throws at import time to enforce the
      // server-only boundary in Next.js bundles. Vitest runs in plain Node,
      // so we alias it to the package's empty stub for tests. Production
      // bundles still go through Next's bundler which uses the real package.
      'server-only': path.resolve(__dirname, './node_modules/server-only/empty.js'),
    },
  },
});
