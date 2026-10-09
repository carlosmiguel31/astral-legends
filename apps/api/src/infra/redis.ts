import { Redis } from 'ioredis';

export type { Redis };

export function createRedis(redisUrl: string, opts: { subscriber?: boolean } = {}): Redis {
  return new Redis(redisUrl, {
    lazyConnect: true,
    // Falha rápido em vez de enfileirar comandos indefinidamente quando o Redis cai.
    maxRetriesPerRequest: 2,
    // O assinante precisa da fila offline para reassinar o canal após reconectar.
    enableOfflineQueue: opts.subscriber === true,
    connectTimeout: 5_000,
  });
}
