import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // A simulação de balanceamento (12 h × 36 combinações) leva alguns segundos.
    testTimeout: 30_000,
    environment: 'node',
  },
});
