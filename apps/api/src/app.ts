import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { AppConfig } from './config/env.js';
import { registerErrorHandling } from './http/errors.js';
import { createAuthGuard, registerCsrfProtection } from './http/guards.js';
import type { PrismaClient } from './infra/prisma.js';
import type { Redis } from './infra/redis.js';
import { authRoutes } from './modules/auth/routes.js';
import { AuthService } from './modules/auth/service.js';
import { LoginThrottle } from './modules/auth/throttle.js';
import { gameRoutes } from './modules/game/routes.js';
import { RealtimeHub } from './realtime/hub.js';
import { contentRoutes } from './routes/content.js';
import { healthRoutes, type HealthProbes } from './routes/health.js';
import { wsRoutes } from './routes/ws.js';

declare module 'fastify' {
  interface FastifyInstance {
    realtime: RealtimeHub;
  }
}

export interface AppDeps {
  config: AppConfig;
  probes: HealthProbes;
  prisma: PrismaClient;
  /** Conexão Redis para contadores de autenticação e publicação de eventos. */
  redis: Redis;
  /** Conexão Redis dedicada para assinar eventos (pub/sub exige conexão exclusiva). */
  redisSubscriber?: Redis;
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
  const { config, prisma, redis } = deps;
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
    // Respostas autenticadas nunca devem ser guardadas por caches intermediários.
    if (request.auth && !reply.hasHeader('cache-control'))
      void reply.header('cache-control', 'no-store');
  });

  registerErrorHandling(app);
  registerCsrfProtection(app, config);

  await app.register(helmet);
  await app.register(cors, {
    origin: (origin, cb) => cb(null, origin === undefined || allowedOrigins.has(origin)),
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    // Com TRUST_PROXY ativo, request.ip vem de X-Forwarded-For (configurar o proxy corretamente).
    keyGenerator: (request) => request.ip ?? 'unknown',
    ...(deps.rateLimitRedis ? { redis: deps.rateLimitRedis, nameSpace: 'astral:rl:' } : {}),
  });
  await app.register(websocket, { options: { maxPayload: 4 * 1024 } });

  const hub = new RealtimeHub(app.log, redis, deps.redisSubscriber);
  app.decorate('realtime', hub);
  const auth = new AuthService(prisma, config, new LoginThrottle(redis, config));
  const requireAuth = createAuthGuard(app, config, auth);

  await app.register(healthRoutes, { probes: deps.probes });
  await app.register(contentRoutes);
  await app.register(wsRoutes, { isOriginAllowed, auth, config, hub });
  await app.register(authRoutes, { config, auth, requireAuth, hub });
  await app.register(gameRoutes, { config, prisma, requireAuth, hub });

  return app;
}
