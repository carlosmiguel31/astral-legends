import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['@astral/source', ...defaultServerConditions] },
  ssr: { resolve: { conditions: ['@astral/source', ...defaultServerConditions] } },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
