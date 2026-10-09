import { Redis } from 'ioredis';

export type { Redis };

export function createRedis(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    lazyConnect: true,
    // Falha rápido em vez de enfileirar comandos indefinidamente quando o Redis cai.
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    connectTimeout: 5_000,
  });
}
