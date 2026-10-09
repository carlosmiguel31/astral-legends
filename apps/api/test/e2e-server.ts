/**
 * Servidor da API para os testes E2E (Playwright).
 * Usa um banco e um Redis descartáveis, recriados a cada execução, para que os
 * testes nunca toquem os dados de desenvolvimento.
 */
import { flushRedis, resetDatabase } from './db-reset.js';

const env = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: process.env.E2E_API_PORT ?? '3100',
  LOG_LEVEL: 'warn',
  DATABASE_URL:
    process.env.E2E_DATABASE_URL ?? 'postgresql://astral:astral_dev@localhost:5432/astral_e2e',
  REDIS_URL: process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/14',
  CORS_ORIGINS: 'http://127.0.0.1:5174,http://localhost:5174',
  // Todos os navegadores do teste saem do mesmo IP.
  REGISTER_LIMIT_PER_HOUR: '1000',
  LOGIN_LIMIT_PER_15MIN: '1000',
  LOGIN_MAX_FAILURES_PER_IP: '1000',
};
Object.assign(process.env, env);

await resetDatabase(env.DATABASE_URL, ['_e2e']);
await flushRedis(env.REDIS_URL);
await import('../src/server.js');
