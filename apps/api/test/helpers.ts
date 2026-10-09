import { loadConfig, type AppConfig } from '../src/config/env.js';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://astral:astral_dev@localhost:5432/astral_test';
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';
export const TEST_ORIGIN = 'http://localhost:5173';

/**
 * Configuração de teste. Os limites de autenticação são altos por padrão porque
 * todos os testes vêm do mesmo IP; os testes de limite os reduzem explicitamente.
 */
export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    REDIS_URL: TEST_REDIS_URL,
    CORS_ORIGINS: TEST_ORIGIN,
    LOG_LEVEL: 'silent',
    REGISTER_LIMIT_PER_HOUR: '10000',
    LOGIN_LIMIT_PER_15MIN: '10000',
    LOGIN_MAX_FAILURES_PER_IP: '10000',
    RATE_LIMIT_MAX: '100000',
    ...overrides,
  });
}
