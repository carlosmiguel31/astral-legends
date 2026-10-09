import { loadConfig, type AppConfig } from '../src/config/env.js';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://astral:astral_dev@localhost:5432/astral_test';
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    REDIS_URL: TEST_REDIS_URL,
    CORS_ORIGINS: 'http://localhost:5173',
    LOG_LEVEL: 'silent',
    ...overrides,
  });
}
