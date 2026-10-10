import { OFFLINE_CAP_MS, initialWaveProgress, settleHunt } from '@astral/game-core';
import { syncResponseSchema, wsServerMessageSchema, type WsServerMessage } from '@astral/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadGameState, lockCharacter } from '../../src/modules/game/state.js';
import { settleActiveHunt } from '../../src/modules/hunt/service.js';
import { testConfig } from '../helpers.js';
import {
  createHero,
  registerUser,
  rewindHunt,
  setupApp,
  type TestContext,
  type TestUser,
} from './support.js';

let ctx: TestContext;
const HOUR = 3_600_000;

beforeAll(async () => {
  ctx = await setupApp();
});

afterAll(async () => {
  await ctx.close();
});

async function hunter(classId: 'guardian' | 'arcanist' | 'blade' = 'blade') {
  const user = await registerUser(ctx.app);
  const state = await createHero(user, classId);
  const start = await user.browser.post('/v1/hunt/start', { regionId: 'campos-do-alvorecer' });
  if (start.statusCode !== 200) throw new Error(`start falhou: ${start.body}`);
  return { user, characterId: state.character.id };
}

async function sync(user: TestUser) {
  const res = await user.browser.post('/v1/hunt/sync');
  expect(res.statusCode).toBe(200);
  return syncResponseSchema.parse(res.json());
}

async function goldOf(accountId: string): Promise<bigint> {
  const w = await ctx.prisma.walletBalance.findUnique({
    where: { accountId_currency: { accountId, currency: 'GOLD' } },
  });
  return w?.amount ?? 0n;
}

describe('iniciar e parar', () => {
  it('inicia uma caçada na região inicial', async () => {
    const { user } = await hunter();
    const body = await sync(user);
    expect(body.state.hunt).toMatchObject({
      status: 'ACTIVE',
      regionId: 'campos-do-alvorecer',
      encountersResolved: 0,
      offlineCapMs: OFFLINE_CAP_MS,
    });
  });

  it('impede regiões bloqueadas e inexistentes', async () => {
    const { user } = await hunter();
    const locked = await user.browser.post('/v1/hunt/start', {
      regionId: 'bosque-das-mares-de-prata',
    });
    expect(locked.statusCode).toBe(403);
    expect(locked.json().error).toMatchObject({ code: 'REGION_LOCKED' });
    expect(locked.json().error.message).toMatch(/nível 6/);
    const missing = await user.browser.post('/v1/hunt/start', { regionId: 'lua-proibida' });
    expect(missing.statusCode).toBe(404);
  });

  it('reiniciar na mesma região não reinicia a caçada (idempotente)', async () => {
    const { user, characterId } = await hunter();
    const before = await ctx.prisma.huntSession.findUniqueOrThrow({ where: { characterId } });
    await user.browser.post('/v1/hunt/start', { regionId: 'campos-do-alvorecer' });
    const after = await ctx.prisma.huntSession.findUniqueOrThrow({ where: { characterId } });
    expect(after.runId).toBe(before.runId);
  });

  it('parar liquida o progresso e encerra a caçada', async () => {
    const { user, characterId } = await hunter();
    await rewindHunt(ctx.prisma, characterId, 10 * 60_000);
    const stop = await user.browser.post('/v1/hunt/stop');
    expect(stop.statusCode).toBe(200);
    const body = syncResponseSchema.parse(stop.json());
    expect(body.state.hunt?.status).toBe('STOPPED');
    expect(body.settlement?.encounters).toBeGreaterThan(0);

    // Parada: o tempo continua passando, mas nada mais é liquidado.
    await rewindHunt(ctx.prisma, characterId, HOUR);
    const later = await sync(user);
    expect(later.settlement).toBeNull();
  });
});

describe('liquidação', () => {
  it('derrota monstros, ganha XP, ouro e sobe de nível; tudo persistido', async () => {
    const { user, characterId } = await hunter();
    await rewindHunt(ctx.prisma, characterId, HOUR);
    const body = await sync(user);

    const s = body.settlement!;
    expect(s.encounters).toBeGreaterThan(100);
    expect(s.wins).toBeGreaterThan(0);
    expect(s.xpGained).toBeGreaterThan(0);
    expect(BigInt(s.gold)).toBeGreaterThan(0n);
    expect(s.levelAfter).toBeGreaterThan(s.levelBefore);
    expect(body.state.character.level).toBe(s.levelAfter);
    // Fase 2A: o saldo inclui as recompensas de primeira conclusão das waves.
    expect(BigInt(s.firstClearGold)).toBeGreaterThan(0n);
    expect(body.state.wallet.gold).toBe(String(BigInt(s.gold) + BigInt(s.firstClearGold)));
    expect(body.state.hunt?.encountersResolved).toBe(s.toEncounter);

    // Encontros recentes para o cliente animar: os últimos trazem os golpes.
    expect(body.recentEncounters.length).toBeGreaterThan(0);
    expect(body.recentEncounters.at(-1)!.events?.length).toBeGreaterThan(0);

    // O saldo é exatamente a soma do livro-razão.
    const sum = await ctx.prisma.ledgerEntry.aggregate({
      where: { accountId: user.accountId, currency: 'GOLD' },
      _sum: { delta: true },
    });
    expect(sum._sum.delta).toBe(BigInt(s.gold) + BigInt(s.firstClearGold));
  });

  it('o resultado bate com o game-core para a mesma semente e janela', async () => {
    const { user, characterId } = await hunter('arcanist');
    await rewindHunt(ctx.prisma, characterId, 30 * 60_000);
    const hunt = await ctx.prisma.huntSession.findUniqueOrThrow({ where: { characterId } });
    const body = await sync(user);
    const persisted = await ctx.prisma.huntSession.findUniqueOrThrow({ where: { characterId } });

    const expected = settleHunt({
      regionId: hunt.regionId,
      seed: Number(hunt.seed),
      nextEncounter: 0,
      lastSettledAtMs: hunt.lastSettledAt.getTime(),
      // O servidor liquidou até algum instante ≥ fim do último encontro; reproduzimos até ele.
      nowMs: persisted.lastSettledAt.getTime(),
      character: { classId: 'arcanist', affinity: 'lunar', level: 1, xp: 0, equipment: [] },
      // Fase 2A: caçadas novas começam no modo Avançar, wave 1.
      progress: initialWaveProgress('advance', 1, 0),
    });
    expect(body.settlement!.toEncounter).toBe(expected.nextEncounter);
    expect(body.state.character.level).toBe(expected.level);
    expect(body.state.character.xp).toBe(expected.xp);
    expect(body.settlement!.gold).toBe(String(expected.gold));
    expect(body.settlement!.firstClearGold).toBe(String(expected.firstClearGold));
    expect(body.settlement!.waveAfter).toBe(expected.progress.wave);
    expect(body.settlement!.wavesCleared).toBe(expected.wavesCleared);
  });

  it('consultar de novo não gera recompensas duplicadas', async () => {
    const { user, characterId } = await hunter();
    await rewindHunt(ctx.prisma, characterId, 20 * 60_000);
    const first = await sync(user);
    const gold = await goldOf(user.accountId);
    const second = await sync(user);
    expect(second.settlement).toBeNull();
    expect(await goldOf(user.accountId)).toBe(gold);
    expect(second.state.character).toEqual(first.state.character);
  });

  it('requisições simultâneas liquidam cada janela uma única vez', async () => {
    const { user, characterId } = await hunter();
    await rewindHunt(ctx.prisma, characterId, 2 * HOUR);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => user.browser.post('/v1/hunt/sync')),
    );
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    const settled = results.map((r) => r.json().settlement).filter((s) => s !== null);
    expect(settled.length).toBeGreaterThanOrEqual(1);

    const rows = await ctx.prisma.huntSettlement.findMany({
      where: { characterId },
      orderBy: { fromEncounter: 'asc' },
    });
    // As janelas são contíguas e sem sobreposição.
    for (let i = 1; i < rows.length; i += 1)
      expect(rows[i]!.fromEncounter).toBe(rows[i - 1]!.toEncounter);
    const totalGold = rows.reduce((sum, r) => sum + r.gold + r.firstClearGold, 0n);
    expect(await goldOf(user.accountId)).toBe(totalGold);
    const ledgerCount = await ctx.prisma.ledgerEntry.count({
      where: { accountId: user.accountId },
    });
    const firstClears = rows.reduce((sum, r) => sum + r.firstClears, 0);
    expect(ledgerCount).toBeLessThanOrEqual(rows.length * 2 + firstClears * 2);
  });

  it('respeita o limite de 8 horas offline', async () => {
    const { user, characterId } = await hunter();
    await rewindHunt(ctx.prisma, characterId, 30 * HOUR);
    const body = await sync(user);
    const s = body.settlement!;
    const window = new Date(s.windowEnd).getTime() - new Date(s.windowStart).getTime();
    expect(window).toBeLessThanOrEqual(OFFLINE_CAP_MS);
    expect(s.forfeitedMs).toBeGreaterThan(21 * HOUR);
    expect(s.forfeitedMs).toBeLessThanOrEqual(22 * HOUR + 5_000);
  });

  it('progresso independe da frequência de consulta (banco real, relógio controlado)', async () => {
    const a = await hunter('guardian');
    const b = await hunter('guardian');
    const t0 = new Date(Date.now() - 3 * HOUR);
    for (const { characterId } of [a, b]) {
      await ctx.prisma.huntSession.update({
        where: { characterId },
        data: { seed: 987_654_321n, startedAt: t0, lastSettledAt: t0 },
      });
    }
    const config = testConfig();
    const settleAt = (accountId: string, now: Date) =>
      ctx.prisma.$transaction(async (tx) =>
        settleActiveHunt(tx, await lockCharacter(tx, accountId), config, now),
      );

    await settleAt(a.user.accountId, new Date(t0.getTime() + 2 * HOUR));
    for (const minutes of [7, 19, 33, 61, 64, 95, 120]) {
      await settleAt(b.user.accountId, new Date(t0.getTime() + minutes * 60_000));
    }

    const [sa, sb] = await Promise.all(
      [a, b].map((h) => loadGameState(ctx.prisma, h.user.accountId, config, new Date())),
    );
    expect(sb!.character.level).toBe(sa!.character.level);
    expect(sb!.character.xp).toBe(sa!.character.xp);
    expect(sb!.wallet).toEqual(sa!.wallet);
    expect(sb!.hunt!.encountersResolved).toBe(sa!.hunt!.encountersResolved);
    expect(sb!.hunt!.lastSettledAt).toBe(sa!.hunt!.lastSettledAt);

    const drops = async (characterId: string) =>
      (
        await ctx.prisma.itemInstance.findMany({
          where: { ownerCharacterId: characterId, source: 'DROP' },
        })
      )
        .map(
          (i) =>
            `${i.sourceRef!.split(':').at(-1)}:${i.defId}:${i.rarity}:${JSON.stringify(i.bonuses)}`,
        )
        .sort();
    expect(await drops(b.characterId)).toEqual(await drops(a.characterId));
  });

  it('itens obtidos ficam no inventário com origem única e o excedente é descartado', async () => {
    const small = await setupApp({ INVENTORY_CAPACITY: '10' });
    try {
      const user = await registerUser(small.app);
      const state = await createHero(user);
      await user.browser.post('/v1/hunt/start', { regionId: 'campos-do-alvorecer' });
      await rewindHunt(small.prisma, state.character.id, 8 * HOUR);
      const res = await user.browser.post('/v1/hunt/sync');
      const s = syncResponseSchema.parse(res.json()).settlement!;
      expect(s.itemsDropped).toBeGreaterThan(9);
      const all = await small.prisma.itemInstance.findMany({
        where: { ownerCharacterId: state.character.id, equippedSlot: null },
      });
      // Recompensas exclusivas de primeira conclusão nunca se perdem, mesmo acima da capacidade.
      const waveRewards = all.filter((i) => i.source === 'WAVE_REWARD');
      const clears = await small.prisma.waveClear.count({
        where: { characterId: state.character.id, firstClearItemDef: { not: null } },
      });
      expect(waveRewards).toHaveLength(clears);
      expect(clears).toBeGreaterThan(0);
      // Fase 2A: os itens de wave também ocupam vaga. O inventário fica na capacidade (ou
      // acima só pelos itens de wave entregues quando ele já estava cheio).
      expect(all.length).toBeGreaterThanOrEqual(10);
      expect(all.length).toBeLessThanOrEqual(10 + waveRewards.length);
      const items = all.filter((i) => i.source === 'DROP');
      expect(s.itemsDiscarded).toBe(s.itemsDropped - items.length);
      expect(items.length).toBeLessThanOrEqual(9); // 1 vaga já ocupada pela arma inicial
      const refs = items.map((i) => i.sourceRef);
      expect(new Set(refs).size).toBe(refs.length);
    } finally {
      await small.close();
    }
  });

  it('trocar de região inicia uma nova caçada sem colidir com as recompensas anteriores', async () => {
    const { user, characterId } = await hunter();
    await rewindHunt(ctx.prisma, characterId, 3 * HOUR);
    const first = await sync(user);
    expect(first.state.character.level).toBeGreaterThanOrEqual(6);
    const oldRun = first.state.hunt!.runId;

    const moved = await user.browser.post('/v1/hunt/start', {
      regionId: 'bosque-das-mares-de-prata',
    });
    expect(moved.statusCode).toBe(200);
    const state = syncResponseSchema.parse(moved.json()).state;
    expect(state.hunt).toMatchObject({
      regionId: 'bosque-das-mares-de-prata',
      encountersResolved: 0,
    });
    expect(state.hunt!.runId).not.toBe(oldRun);

    await rewindHunt(ctx.prisma, characterId, 30 * 60_000);
    const second = await sync(user);
    expect(second.settlement!.fromEncounter).toBe(0);
    expect(second.recentEncounters.every((e) => e.runId === state.hunt!.runId)).toBe(true);
  });

  it('o histórico lista as liquidações e os encontros recentes', async () => {
    const { user, characterId } = await hunter();
    await rewindHunt(ctx.prisma, characterId, 15 * 60_000);
    await sync(user);
    const res = await user.browser.get('/v1/hunt/history');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.settlements).toHaveLength(1);
    expect(body.recentEncounters.length).toBeGreaterThan(0);
    // O histórico persistido não guarda golpes individuais.
    expect(body.recentEncounters.every((e: { events?: unknown }) => e.events === undefined)).toBe(
      true,
    );
  });

  it('o resumo de liquidação é imutável', async () => {
    const { user, characterId } = await hunter();
    await rewindHunt(ctx.prisma, characterId, 15 * 60_000);
    await sync(user);
    const row = await ctx.prisma.huntSettlement.findFirstOrThrow({ where: { characterId } });
    await expect(
      ctx.prisma.huntSettlement.update({ where: { id: row.id }, data: { gold: 999_999n } }),
    ).rejects.toThrow();
  });
});

describe('equipamento e caçada', () => {
  it('equipar liquida antes da troca: o passado usa o equipamento antigo', async () => {
    const { user, characterId } = await hunter();
    await rewindHunt(ctx.prisma, characterId, 20 * 60_000);
    const [starter] = (await user.browser.get('/v1/inventory')).json().items;
    const res = await user.browser.post(`/v1/inventory/${starter.id}/equip`);
    const body = syncResponseSchema.parse(res.json());
    expect(body.settlement?.encounters).toBeGreaterThan(0);
    expect(body.state.equipment).toHaveLength(1);
  });
});

describe('tempo real', () => {
  it('outras abas da mesma conta são notificadas quando o estado muda', async () => {
    const { user, characterId } = await hunter();
    const messages: WsServerMessage[] = [];
    const ws = await ctx.app.injectWS(
      '/ws',
      { headers: { origin: 'http://localhost:5173', cookie: user.browser.cookieHeader() } },
      {
        onInit: (socket) =>
          socket.on('message', (data) =>
            messages.push(wsServerMessageSchema.parse(JSON.parse(String(data)))),
          ),
      },
    );
    await rewindHunt(ctx.prisma, characterId, 5 * 60_000);
    await sync(user);
    const deadline = Date.now() + 2_000;
    while (!messages.some((m) => m.type === 'state.changed') && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(messages.find((m) => m.type === 'hello')).toMatchObject({ authenticated: true });
    expect(messages.find((m) => m.type === 'state.changed')).toMatchObject({ reason: 'hunt' });
    ws.terminate();
  });
});
