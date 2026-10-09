import { validateContent } from '@astral/game-core';
import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createPrisma } from './infra/prisma.js';
import { createRedis } from './infra/redis.js';

async function main(): Promise<void> {
  const config = loadConfig();
  // Conteúdo estático inválido impede o boot em vez de corromper o jogo em produção.
  validateContent();

  const prisma = createPrisma(config.DATABASE_URL);
  const redis = createRedis(config.REDIS_URL);
  // Pub/sub exige uma conexão dedicada; aqui o enfileiramento offline é permitido
  // para que a assinatura seja refeita após reconexões.
  const redisSubscriber = createRedis(config.REDIS_URL, { subscriber: true });
  for (const client of [redis, redisSubscriber]) {
    client.on('error', () => {
      // Erros de conexão aparecem no /health/ready; evitamos derrubar o processo.
    });
  }
  await redis.connect().catch(() => undefined);
  await redisSubscriber.connect().catch(() => undefined);

  const app = await buildApp({
    config,
    prisma,
    redis,
    redisSubscriber,
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
  await app.realtime.start().catch((error: unknown) => {
    app.log.warn({ err: error }, 'tempo real sem Redis: entregas apenas locais');
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'encerrando');
    try {
      await app.close();
      await prisma.$disconnect();
      redis.disconnect();
      redisSubscriber.disconnect();
    } finally {
      process.exit(0);
    }
  };
  // SIGTERM não existe no Windows; SIGINT (Ctrl+C) funciona nos dois sistemas.
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
