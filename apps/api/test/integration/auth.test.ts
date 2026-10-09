import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/lib/crypto.js';
import { Browser, registerUser, setupApp, type TestContext } from './support.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await setupApp({ LOGIN_MAX_FAILURES_PER_ACCOUNT: '5' });
});

afterAll(async () => {
  await ctx.close();
});

function newCredentials() {
  const username = `u_${randomUUID().slice(0, 8)}`;
  const password = 'senha-muito-segura-123';
  return { username, email: `${username}@teste.local`, password, passwordConfirm: password };
}

describe('cadastro', () => {
  it('cria a conta, inicia a sessão com cookies seguros e guarda a senha com Argon2id', async () => {
    const browser = new Browser(ctx.app);
    const creds = newCredentials();
    const res = await browser.post('/v1/auth/register', {
      ...creds,
      email: creds.email.toUpperCase(),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().account).toMatchObject({
      username: creds.username,
      email: creds.email,
      hasCharacter: false,
    });

    const setCookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(setCookies).toHaveLength(2);
    for (const c of setCookies) {
      expect(c).toMatch(/HttpOnly/i);
      expect(c).toMatch(/SameSite=Strict/i);
      expect(c).toMatch(/Path=\//);
    }
    // Nenhum token no corpo da resposta (nada para guardar em localStorage).
    expect(res.body).not.toMatch(/token/i);

    const account = await ctx.prisma.account.findUniqueOrThrow({ where: { email: creds.email } });
    expect(account.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(account.passwordHash).not.toContain(creds.password);

    const me = await browser.get('/v1/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.json().account.username).toBe(creds.username);
  });

  it('informa nome de usuário em uso (é público), sem diferenciar maiúsculas', async () => {
    const creds = newCredentials();
    await new Browser(ctx.app).post('/v1/auth/register', creds);
    const res = await new Browser(ctx.app).post('/v1/auth/register', {
      ...newCredentials(),
      username: creds.username.toUpperCase(),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({
      code: 'USERNAME_TAKEN',
      fields: { username: expect.any(String) },
    });
  });

  it('e-mail repetido recebe resposta genérica, sem confirmar que a conta existe', async () => {
    const creds = newCredentials();
    await new Browser(ctx.app).post('/v1/auth/register', creds);
    const res = await new Browser(ctx.app).post('/v1/auth/register', {
      ...newCredentials(),
      email: creds.email,
    });
    expect(res.statusCode).toBe(409);
    const error = res.json().error;
    expect(error.code).toBe('REGISTRATION_FAILED');
    expect(error.message).not.toMatch(/e-?mail/i);
    expect(error.fields).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('cadastros simultâneos com o mesmo e-mail criam uma única conta', async () => {
    const creds = newCredentials();
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        new Browser(ctx.app).post('/v1/auth/register', {
          ...creds,
          username: `${creds.username.slice(0, 10)}_${i}`,
        }),
      ),
    );
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(4);
    expect(await ctx.prisma.account.count({ where: { email: creds.email } })).toBe(1);
  });
});

describe('login', () => {
  it('entra com e-mail e senha corretos', async () => {
    const user = await registerUser(ctx.app);
    const browser = new Browser(ctx.app);
    const res = await browser.post('/v1/auth/login', {
      email: user.email,
      password: user.password,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().account.id).toBe(user.accountId);
    expect((await browser.get('/v1/auth/me')).statusCode).toBe(200);
  });

  it('senha errada e e-mail inexistente recebem a mesma resposta', async () => {
    const user = await registerUser(ctx.app);
    const wrong = await new Browser(ctx.app).post('/v1/auth/login', {
      email: user.email,
      password: 'senha-errada-000',
    });
    const unknown = await new Browser(ctx.app).post('/v1/auth/login', {
      email: `ninguem-${randomUUID()}@teste.local`,
      password: 'senha-errada-000',
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.json().error.message).toBe(wrong.json().error.message);
  });

  it('bloqueia o IP após muitas falhas em contas diferentes', async () => {
    const limited = await setupApp({ LOGIN_MAX_FAILURES_PER_IP: '3' });
    try {
      const attacker = new Browser(limited.app, '198.51.100.9');
      for (let i = 0; i < 3; i += 1) {
        const r = await attacker.post('/v1/auth/login', {
          email: `alvo-${randomUUID()}@teste.local`,
          password: 'tentativa-123',
        });
        expect(r.statusCode).toBe(401);
      }
      const blocked = await attacker.post('/v1/auth/login', {
        email: `alvo-${randomUUID()}@teste.local`,
        password: 'tentativa-123',
      });
      expect(blocked.statusCode).toBe(429);
      // Outro IP continua podendo entrar.
      const user = await registerUser(limited.app);
      const ok = await new Browser(limited.app).post('/v1/auth/login', {
        email: user.email,
        password: user.password,
      });
      expect(ok.statusCode).toBe(200);
    } finally {
      await limited.close();
    }
  });

  it('bloqueia a conta após tentativas repetidas, mesmo com a senha certa', async () => {
    const user = await registerUser(ctx.app);
    const browser = new Browser(ctx.app);
    for (let i = 0; i < 5; i += 1) {
      const r = await browser.post('/v1/auth/login', {
        email: user.email,
        password: `errada-${i}-xxxx`,
      });
      expect(r.statusCode).toBe(401);
    }
    const blocked = await browser.post('/v1/auth/login', {
      email: user.email,
      password: user.password,
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe('TOO_MANY_ATTEMPTS');
    // O contador fica no Redis com chave de hash (sem e-mail em claro).
    const keys = await ctx.redis.keys('astral:auth:fail:email:*');
    expect(keys.some((k) => k.includes(user.email))).toBe(false);
  });

  it('limita cadastros por IP', async () => {
    const limited = await setupApp({ REGISTER_LIMIT_PER_HOUR: '2' });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const sameIp = new Browser(limited.app, '203.0.113.7');
        codes.push((await sameIp.post('/v1/auth/register', newCredentials())).statusCode);
      }
      expect(codes).toEqual([201, 201, 429]);
    } finally {
      await limited.close();
    }
  });
});

describe('sessão', () => {
  it('acesso sem sessão é negado', async () => {
    const res = await new Browser(ctx.app).get('/v1/auth/me');
    expect(res.statusCode).toBe(401);
  });

  it('logout revoga a sessão no servidor (o cookie antigo deixa de valer)', async () => {
    const user = await registerUser(ctx.app);
    const stolen = user.browser.cookieHeader();
    const res = await user.browser.post('/v1/auth/logout');
    expect(res.statusCode).toBe(204);
    expect(user.browser.cookies.size).toBe(0);

    const replay = await ctx.app.inject({ url: '/v1/auth/me', headers: { cookie: stolen } });
    expect(replay.statusCode).toBe(401);
    const sessions = await ctx.prisma.authSession.findMany({
      where: { accountId: user.accountId },
    });
    expect(sessions.every((s) => s.revokedAt !== null && s.revokedReason === 'logout')).toBe(true);
  });

  it('token de acesso expirado é recusado e renovado pelo refresh', async () => {
    const user = await registerUser(ctx.app);
    await ctx.prisma.authSession.updateMany({
      where: { accountId: user.accountId },
      data: { accessExpiresAt: new Date(Date.now() - 1_000) },
    });
    const expired = await user.browser.get('/v1/auth/me');
    expect(expired.statusCode).toBe(401);
    expect(expired.json().error.code).toBe('SESSION_EXPIRED');

    const refreshed = await user.browser.post('/v1/auth/refresh');
    expect(refreshed.statusCode).toBe(200);
    expect((await user.browser.get('/v1/auth/me')).statusCode).toBe(200);
  });

  it('sessão com expiração absoluta vencida não pode ser renovada', async () => {
    const user = await registerUser(ctx.app);
    await ctx.prisma.authSession.updateMany({
      where: { accountId: user.accountId },
      data: {
        accessExpiresAt: new Date(Date.now() - 2_000),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    const res = await user.browser.post('/v1/auth/refresh');
    expect(res.statusCode).toBe(401);
    expect(user.browser.cookies.size).toBe(0);
  });

  it('refresh rotaciona os tokens e o reuso de um token antigo revoga a sessão', async () => {
    const user = await registerUser(ctx.app);
    const oldRefresh = [...user.browser.cookies].find(([k]) => k.endsWith('al_rt'))![1];

    expect((await user.browser.post('/v1/auth/refresh')).statusCode).toBe(200);
    const newRefresh = [...user.browser.cookies].find(([k]) => k.endsWith('al_rt'))![1];
    expect(newRefresh).not.toBe(oldRefresh);
    const session = await ctx.prisma.authSession.findFirstOrThrow({
      where: { accountId: user.accountId },
    });
    expect(session.refreshTokenHash).toBe(sha256Hex(newRefresh));
    expect(session.previousRefreshTokenHash).toBe(sha256Hex(oldRefresh));

    // Dentro da janela de tolerância (duas abas renovando juntas): não revoga.
    const race = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { cookie: `al_rt=${oldRefresh}`, origin: 'http://localhost:5173' },
    });
    expect(race.statusCode).toBe(409);
    expect(race.json().error.code).toBe('REFRESH_RACE');

    // Fora da janela: reuso indica roubo e derruba a sessão inteira.
    await ctx.prisma.authSession.update({
      where: { id: session.id },
      data: { refreshedAt: new Date(Date.now() - 60_000) },
    });
    const reuse = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { cookie: `al_rt=${oldRefresh}`, origin: 'http://localhost:5173' },
    });
    expect(reuse.statusCode).toBe(401);
    const revoked = await ctx.prisma.authSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(revoked.revokedReason).toBe('refresh_reuse');
    expect((await user.browser.get('/v1/auth/me')).statusCode).toBe(401);
  });

  it('“sair de todos os dispositivos” revoga todas as sessões da conta', async () => {
    const user = await registerUser(ctx.app);
    const other = new Browser(ctx.app);
    await other.post('/v1/auth/login', { email: user.email, password: user.password });
    expect((await other.get('/v1/auth/me')).statusCode).toBe(200);

    expect((await user.browser.post('/v1/auth/logout-all')).statusCode).toBe(204);
    expect((await other.get('/v1/auth/me')).statusCode).toBe(401);
    expect(
      await ctx.prisma.authSession.count({ where: { accountId: user.accountId, revokedAt: null } }),
    ).toBe(0);
  });

  it('tokens nunca são persistidos em claro', async () => {
    const user = await registerUser(ctx.app);
    const tokens = [...user.browser.cookies.values()];
    const session = await ctx.prisma.authSession.findFirstOrThrow({
      where: { accountId: user.accountId },
    });
    const stored = JSON.stringify(session);
    for (const t of tokens) expect(stored).not.toContain(t);
  });
});
