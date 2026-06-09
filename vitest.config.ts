import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/tests/**'],
      // json-summary + json feed the PR coverage comment in CI (vitest-coverage-report-action)
      reporter: ['text', 'lcov', 'json-summary', 'json'],
    },
  },
});
