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
  redis.on('error', () => {
    // Erros de conexão aparecem no /health/ready; evitamos derrubar o processo.
  });
  await redis.connect().catch(() => undefined);

  const app = await buildApp({
    config,
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

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'encerrando');
    try {
      await app.close();
      await prisma.$disconnect();
      redis.disconnect();
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
