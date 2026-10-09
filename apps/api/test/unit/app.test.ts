import {
  contentResponseSchema,
  healthReadySchema,
  wsServerMessageSchema,
  type WsServerMessage,
} from '@astral/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createPrisma } from '../../src/infra/prisma.js';
import { createRedis } from '../../src/infra/redis.js';
import type { HealthProbes } from '../../src/routes/health.js';
import { TEST_DATABASE_URL, TEST_REDIS_URL, TEST_ORIGIN, testConfig } from '../helpers.js';

const up = async () => undefined;
const down = async () => {
  throw new Error('indisponível');
};

let app: FastifyInstance | undefined;

async function makeApp(
  probes: HealthProbes = { database: up, redis: up },
  env: Record<string, string> = {},
) {
  // Clientes sem conexão: os testes unitários nunca chegam ao banco nem ao Redis.
  app = await buildApp({
    config: testConfig(env),
    probes,
    logger: false,
    prisma: createPrisma(TEST_DATABASE_URL),
    redis: createRedis(TEST_REDIS_URL),
  });
  await app.ready();
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('health', () => {
  it('live responde 200', async () => {
    const res = await (await makeApp()).inject('/health/live');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('ready responde 200 quando as dependências estão de pé', async () => {
    const res = await (await makeApp()).inject('/health/ready');
    expect(res.statusCode).toBe(200);
    expect(healthReadySchema.parse(res.json())).toEqual({
      status: 'ready',
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('ready responde 503 e aponta a dependência fora do ar', async () => {
    const res = await (await makeApp({ database: up, redis: down })).inject('/health/ready');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'degraded', checks: { database: 'up', redis: 'down' } });
  });
});

describe('conteúdo', () => {
  it('expõe classes, afinidades e regiões no formato do contrato', async () => {
    const res = await (await makeApp()).inject('/v1/content');
    expect(res.statusCode).toBe(200);
    const body = contentResponseSchema.parse(res.json());
    expect(body.classes.map((c) => c.name)).toEqual([
      'Guardião Astral',
      'Arcanista Celestial',
      'Lâmina Estelar',
    ]);
    expect(body.affinities.map((a) => a.name)).toEqual(['Solar', 'Lunar', 'Tempestade', 'Abissal']);
    expect(body.regions.map((r) => [r.name, r.unlock.minLevel])).toEqual([
      ['Campos do Alvorecer', 1],
      ['Bosque das Marés de Prata', 6],
      ['Desfiladeiro dos Trovões', 12],
    ]);
    for (const region of body.regions) {
      expect(region.monsters.length).toBeGreaterThan(0);
      expect(region.loot.length).toBeGreaterThan(0);
    }
    expect(res.headers['cache-control']).toContain('max-age');
  });
});

describe('infraestrutura HTTP', () => {
  it('retorna 404 no formato padrão com requestId', async () => {
    const res = await (await makeApp()).inject('/nao-existe');
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('aplica cabeçalhos de segurança', async () => {
    const res = await (await makeApp()).inject('/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('libera CORS apenas para origens configuradas', async () => {
    const a = await makeApp();
    const ok = await a.inject({ url: '/v1/content', headers: { origin: 'http://localhost:5173' } });
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const blocked = await a.inject({
      url: '/v1/content',
      headers: { origin: 'https://malicioso.test' },
    });
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('limita requisições por IP', async () => {
    const a = await makeApp(undefined, { RATE_LIMIT_MAX: '2' });
    await a.inject('/v1/content');
    await a.inject('/v1/content');
    const res = await a.inject('/v1/content');
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('RATE_LIMITED');
  });
});

describe('websocket', () => {
  function collect(ws: { on(event: 'message', cb: (data: Buffer) => void): unknown }) {
    const messages: WsServerMessage[] = [];
    ws.on('message', (data) =>
      messages.push(wsServerMessageSchema.parse(JSON.parse(data.toString()))),
    );
    return messages;
  }

  async function waitFor<T>(fn: () => T | undefined, timeoutMs = 2_000): Promise<T> {
    const start = Date.now();
    for (;;) {
      const value = fn();
      if (value !== undefined) return value;
      if (Date.now() - start > timeoutMs) throw new Error('timeout aguardando mensagem');
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  it('envia hello e responde ping com pong', async () => {
    const a = await makeApp();
    let messages: WsServerMessage[] = [];
    const ws = await a.injectWS(
      '/ws',
      { headers: { origin: 'http://localhost:5173' } },
      {
        onInit: (socket) => {
          messages = collect(socket);
        },
      },
    );
    const hello = await waitFor(() => messages.find((m) => m.type === 'hello'));
    expect(hello).toMatchObject({ type: 'hello', protocol: 2, authenticated: false });

    ws.send(JSON.stringify({ type: 'ping', nonce: 'n1' }));
    const pong = await waitFor(() => messages.find((m) => m.type === 'pong'));
    expect(pong).toMatchObject({ type: 'pong', nonce: 'n1' });
    ws.terminate();
  });

  it('rejeita mensagens inválidas sem derrubar a conexão', async () => {
    const a = await makeApp();
    let messages: WsServerMessage[] = [];
    const ws = await a.injectWS(
      '/ws',
      { headers: { origin: 'http://localhost:5173' } },
      {
        onInit: (socket) => {
          messages = collect(socket);
        },
      },
    );
    ws.send('não é json');
    ws.send(JSON.stringify({ type: 'grantGold', amount: 1_000_000 }));
    const errors = await waitFor(() => {
      const list = messages.filter((m) => m.type === 'error');
      return list.length >= 2 ? list : undefined;
    });
    expect(errors.map((e) => (e.type === 'error' ? e.code : ''))).toEqual([
      'BAD_JSON',
      'BAD_MESSAGE',
    ]);
    ws.terminate();
  });

  it('recusa origens não permitidas', async () => {
    const a = await makeApp();
    await expect(
      a.injectWS('/ws', { headers: { origin: 'https://malicioso.test' } }),
    ).rejects.toThrow();
  });
});

describe('proteções de sessão e CSRF (sem tocar no banco)', () => {
  it('rotas de jogo exigem sessão', async () => {
    const a = await makeApp();
    for (const [method, url] of [
      ['GET', '/v1/game/state'],
      ['GET', '/v1/auth/me'],
      ['POST', '/v1/hunt/sync'],
      ['GET', '/v1/inventory'],
    ] as const) {
      const res = await a.inject({ method, url, headers: { origin: TEST_ORIGIN } });
      expect(res.statusCode, url).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('recusa métodos que alteram estado vindos de outra origem', async () => {
    const a = await makeApp();
    const res = await a.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { origin: 'https://site-malicioso.test', 'content-type': 'application/json' },
      payload: { email: 'x@y.com', password: 'qualquer' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_REJECTED');
  });

  it('recusa requisições marcadas pelo navegador como cross-site', async () => {
    const a = await makeApp();
    const res = await a.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('não aceita corpo text/plain (formulários entre sites)', async () => {
    const a = await makeApp();
    const res = await a.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { origin: TEST_ORIGIN, 'content-type': 'text/plain' },
      payload: '{"email":"x@y.com","password":"abc"}',
    });
    expect(res.statusCode).toBe(415);
  });

  it('valida a entrada antes de qualquer consulta, com erros por campo', async () => {
    const a = await makeApp();
    const res = await a.inject({
      method: 'POST',
      url: '/v1/auth/register',
      headers: { origin: TEST_ORIGIN },
      payload: { username: 'a', email: 'invalido', password: '123', passwordConfirm: '456' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(body.error.fields)).toEqual(
      expect.arrayContaining(['username', 'email', 'password']),
    );
  });

  it('exige origem em produção para métodos que alteram estado', async () => {
    const a = await makeApp(undefined, { NODE_ENV: 'production', CORS_ORIGINS: 'https://jogo.test' });
    const res = await a.inject({ method: 'POST', url: '/v1/auth/logout' });
    expect(res.statusCode).toBe(403);
  });
});
