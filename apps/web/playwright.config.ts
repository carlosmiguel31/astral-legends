import { defineConfig, devices } from '@playwright/test';

// Use PLAYWRIGHT_CHANNEL=chrome para usar o Chrome instalado no sistema em vez do
// Chromium baixado por `pnpm exec playwright install chromium`.
const channel = process.env.PLAYWRIGHT_CHANNEL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) } },
  ],
  // Sobe a API e o frontend reais. Requer Postgres e Redis em execução (pnpm db:up).
  webServer: [
    {
      command: 'pnpm --filter @astral/api dev',
      cwd: '../..',
      url: 'http://127.0.0.1:3000/health/ready',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @astral/web dev',
      cwd: '../..',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
