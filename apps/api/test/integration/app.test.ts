import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createPrisma, type PrismaClient } from '../../src/infra/prisma.js';
import { createRedis, type Redis } from '../../src/infra/redis.js';
import { TEST_DATABASE_URL, TEST_REDIS_URL, testConfig } from '../helpers.js';

let prisma: PrismaClient;
let redis: Redis;
let app: FastifyInstance;

beforeAll(async () => {
  prisma = createPrisma(TEST_DATABASE_URL);
  redis = createRedis(TEST_REDIS_URL);
  await redis.connect();
  await redis.flushdb();
  app = await buildApp({
    config: testConfig({ RATE_LIMIT_MAX: '3' }),
    logger: false,
    prisma,
    redis,
    rateLimitRedis: redis,
    probes: {
      database: async () => {
        await prisma.$queryRaw`SELECT 1`;
      },
      redis: async () => {
        await redis.ping();
      },
    },
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
});

describe('API com dependências reais', () => {
  it('fica pronta com Postgres e Redis acessíveis', async () => {
    const res = await app.inject('/health/ready');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready', checks: { database: 'up', redis: 'up' } });
  });

  it('rate limit é armazenado no Redis (compartilhado entre instâncias)', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 4; i += 1) codes.push((await app.inject('/v1/content')).statusCode);
    expect(codes).toEqual([200, 200, 200, 429]);
    const keys = await redis.keys('astral:rl:*');
    expect(keys.length).toBeGreaterThan(0);
  });
});
