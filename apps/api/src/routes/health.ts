import type { HealthReady } from '@astral/shared';
import type { FastifyInstance } from 'fastify';

export type Probe = () => Promise<void>;

export interface HealthProbes {
  database: Probe;
  redis: Probe;
}

const PROBE_TIMEOUT_MS = 2_000;

async function check(probe: Probe): Promise<'up' | 'down'> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), PROBE_TIMEOUT_MS);
      }),
    ]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * - /health/live: o processo está de pé (para reinício pelo orquestrador).
 * - /health/ready: dependências acessíveis (para o balanceador enviar tráfego).
 */
export async function healthRoutes(
  app: FastifyInstance,
  opts: { probes: HealthProbes },
): Promise<void> {
  const startedAt = Date.now();

  app.get('/health/live', { config: { rateLimit: false } }, async () => ({
    status: 'ok' as const,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
  }));

  app.get('/health/ready', { config: { rateLimit: false } }, async (_request, reply) => {
    const [database, redis] = await Promise.all([
      check(opts.probes.database),
      check(opts.probes.redis),
    ]);
    const ready = database === 'up' && redis === 'up';
    const payload: HealthReady = {
      status: ready ? 'ready' : 'degraded',
      checks: { database, redis },
    };
    return reply.status(ready ? 200 : 503).send(payload);
  });
}
