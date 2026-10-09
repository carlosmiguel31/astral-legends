import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { AppConfig } from './config/env.js';
import { registerErrorHandling } from './http/errors.js';
import type { Redis } from './infra/redis.js';
import { contentRoutes } from './routes/content.js';
import { healthRoutes, type HealthProbes } from './routes/health.js';
import { wsRoutes } from './routes/ws.js';

export interface AppDeps {
  config: AppConfig;
  probes: HealthProbes;
  /** Quando presente, o rate limit é compartilhado entre instâncias via Redis. */
  rateLimitRedis?: Redis;
  /** Sobrescreve o logger (ex.: `false` nos testes). */
  logger?: FastifyServerOptions['logger'];
}

function loggerOptions(config: AppConfig): FastifyServerOptions['logger'] {
  const base = {
    level: config.LOG_LEVEL,
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
  };
  if (config.NODE_ENV === 'development') {
    return {
      ...base,
      transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } },
    };
  }
  return base;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const allowedOrigins = new Set(config.CORS_ORIGINS);
  const isOriginAllowed = (origin: string | undefined): boolean => {
    // Clientes sem Origin (ferramentas, testes) só são aceitos fora de produção.
    if (origin === undefined) return config.NODE_ENV !== 'production';
    return allowedOrigins.has(origin);
  };

  const app = Fastify({
    logger: deps.logger ?? loggerOptions(config),
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 64 * 1024,
    genReqId: () => randomUUID(),
    requestIdHeader: false,
  });

  app.addHook('onSend', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });

  registerErrorHandling(app);

  await app.register(helmet);
  await app.register(cors, {
    origin: (origin, cb) => cb(null, origin === undefined || allowedOrigins.has(origin)),
    credentials: true,
  });
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    // Com TRUST_PROXY ativo, request.ip vem de X-Forwarded-For (configurar o proxy corretamente).
    keyGenerator: (request) => request.ip ?? 'unknown',
    ...(deps.rateLimitRedis ? { redis: deps.rateLimitRedis, nameSpace: 'astral:rl:' } : {}),
  });
  await app.register(websocket, { options: { maxPayload: 4 * 1024 } });

  await app.register(healthRoutes, { probes: deps.probes });
  await app.register(contentRoutes);
  await app.register(wsRoutes, { isOriginAllowed });

  return app;
}
