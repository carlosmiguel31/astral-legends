import { randomUUID } from 'node:crypto';
import type { GameState } from '@astral/shared';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../src/app.js';
import { createPrisma, type PrismaClient } from '../../src/infra/prisma.js';
import { createRedis, type Redis } from '../../src/infra/redis.js';
import { TEST_DATABASE_URL, TEST_ORIGIN, TEST_REDIS_URL, testConfig } from '../helpers.js';
import { heroName } from './db.js';

export interface TestContext {
  app: FastifyInstance;
  prisma: PrismaClient;
  redis: Redis;
  close(): Promise<void>;
}

/** Sobe a API completa com Postgres e Redis reais. */
export async function setupApp(env: Record<string, string> = {}): Promise<TestContext> {
  const prisma = createPrisma(TEST_DATABASE_URL);
  const redis = createRedis(TEST_REDIS_URL);
  await redis.connect();
  const app = await buildApp({
    config: testConfig(env),
    prisma,
    redis,
    logger: false,
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
  return {
    app,
    prisma,
    redis,
    async close() {
      await app.close();
      await prisma.$disconnect();
      redis.disconnect();
    },
  };
}

/**
 * Cliente que se comporta como o navegador: guarda os cookies recebidos
 * (respeitando expiração e remoção) e envia o cabeçalho Origin do frontend.
 */
let ipCounter = 0;

export class Browser {
  readonly cookies = new Map<string, string>();
  /** Cada navegador tem seu IP (como usuários reais); pode ser fixado para testar limites. */
  readonly ip: string;

  constructor(
    private readonly app: FastifyInstance,
    ip?: string,
  ) {
    ipCounter += 1;
    this.ip = ip ?? `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
  }

  cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async request(
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    payload?: unknown,
    headers: Record<string, string> = {},
  ): Promise<LightMyRequestResponse> {
    const res = await this.app.inject({
      method,
      url,
      remoteAddress: this.ip,
      headers: {
        origin: TEST_ORIGIN,
        ...(this.cookies.size > 0 ? { cookie: this.cookieHeader() } : {}),
        ...headers,
      },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
    for (const c of res.cookies) {
      const expired = c.expires !== undefined && new Date(c.expires).getTime() <= Date.now();
      if (c.value === '' || expired) this.cookies.delete(c.name);
      else this.cookies.set(c.name, c.value);
    }
    return res;
  }

  get(url: string) {
    return this.request('GET', url);
  }
  post(url: string, payload?: unknown) {
    return this.request('POST', url, payload);
  }
  delete(url: string) {
    return this.request('DELETE', url);
  }
}

export interface TestUser {
  browser: Browser;
  username: string;
  email: string;
  password: string;
  accountId: string;
}

export async function registerUser(app: FastifyInstance): Promise<TestUser> {
  const browser = new Browser(app);
  const username = `u_${randomUUID().slice(0, 8)}`;
  const email = `${username}@teste.local`;
  const password = 'senha-muito-segura-123';
  const res = await browser.post('/v1/auth/register', {
    username,
    email,
    password,
    passwordConfirm: password,
  });
  if (res.statusCode !== 201) throw new Error(`cadastro falhou: ${res.statusCode} ${res.body}`);
  return { browser, username, email, password, accountId: res.json().account.id };
}

export async function createHero(
  user: TestUser,
  classId: 'guardian' | 'arcanist' | 'blade' = 'blade',
  affinity: 'solar' | 'lunar' | 'storm' | 'abyssal' = 'lunar',
): Promise<GameState> {
  const res = await user.browser.post('/v1/characters', {
    name: heroName(),
    classId,
    affinity,
    appearance: { hair: 1, skin: 2, cloak: 3 },
  });
  if (res.statusCode !== 201) throw new Error(`criação falhou: ${res.statusCode} ${res.body}`);
  return res.json() as GameState;
}

/** Desloca a caçada para o passado, simulando tempo decorrido (sem tocar no relógio do app). */
export async function rewindHunt(
  prisma: PrismaClient,
  characterId: string,
  ms: number,
): Promise<void> {
  const hunt = await prisma.huntSession.findUniqueOrThrow({ where: { characterId } });
  await prisma.huntSession.update({
    where: { id: hunt.id },
    data: {
      startedAt: new Date(hunt.startedAt.getTime() - ms),
      lastSettledAt: new Date(hunt.lastSettledAt.getTime() - ms),
    },
  });
}
