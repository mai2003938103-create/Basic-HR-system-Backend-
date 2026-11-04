import { configDefaults, defineConfig } from 'vitest/config';
import { PENDING } from './tests/pending.js';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['tests/helpers/env.ts'],
    globalSetup: ['tests/helpers/global-setup.ts'],
    exclude: [...configDefaults.exclude, ...PENDING],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
