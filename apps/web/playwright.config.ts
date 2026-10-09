import { defineConfig, devices } from '@playwright/test';

// Use PLAYWRIGHT_CHANNEL=chrome para usar o Chrome instalado no sistema em vez do
// Chromium baixado por `pnpm exec playwright install chromium`.
const channel = process.env.PLAYWRIGHT_CHANNEL;
const API_PORT = 3100;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  // A jornada usa contas independentes; ainda assim, serial deixa os logs legíveis.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 240_000,
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], ...(channel ? { channel } : {}) },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  // Servidores próprios do E2E: API na porta 3100 com banco `astral_e2e` recriado a cada
  // execução e frontend na 5174. Os dados de desenvolvimento nunca são tocados.
  // Requer Postgres e Redis em execução (pnpm db:up).
  webServer: [
    {
      command: 'pnpm --filter @astral/api e2e:server',
      cwd: '../..',
      url: `http://127.0.0.1:${API_PORT}/health/ready`,
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: `pnpm --filter @astral/web exec vite --port ${WEB_PORT} --strictPort`,
      cwd: '../..',
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: { VITE_API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
