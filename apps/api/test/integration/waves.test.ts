import {
  LEGACY_WAVE_PROGRESS,
  OFFLINE_CAP_MS,
  WAVE_RULES,
  initialWaveProgress,
  settleHunt,
} from '@astral/game-core';
import {
  syncResponseSchema,
  wsServerMessageSchema,
  type GameState,
  type WsServerMessage,
} from '@astral/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lockCharacter } from '../../src/modules/game/state.js';
import {
  changeHuntSettings,
  firstClearKey,
  settleActiveHunt,
} from '../../src/modules/hunt/service.js';
import { discardItem, equipItem } from '../../src/modules/inventory/service.js';
import { testConfig } from '../helpers.js';
import {
  Browser,
  createHero,
  registerUser,
  rewindHunt,
  setupApp,
  type TestContext,
  type TestUser,
} from './support.js';

let ctx: TestContext;
const MIN = 60_000;
const HOUR = 60 * MIN;
const CAMPOS = 'campos-do-alvorecer';
const BOSQUE = 'bosque-das-mares-de-prata';

beforeAll(async () => {
  ctx = await setupApp();
});

afterAll(async () => {
  await ctx.close();
});

async function hunter(
  classId: 'guardian' | 'arcanist' | 'blade' = 'blade',
  affinity: 'solar' | 'lunar' | 'storm' | 'abyssal' = 'lunar',
) {
  const user = await registerUser(ctx.app);
  const state = await createHero(user, classId, affinity);
  const start = await user.browser.post('/v1/hunt/start', { regionId: CAMPOS });
  if (start.statusCode !== 200) throw new Error(`start falhou: ${start.body}`);
  return { user, characterId: state.character.id };
}

async function sync(user: TestUser | Browser) {
  const browser = user instanceof Browser ? user : user.browser;
  const res = await browser.post('/v1/hunt/sync');
  expect(res.statusCode).toBe(200);
  return syncResponseSchema.parse(res.json());
}

async function settings(user: TestUser | Browser, body: object) {
  const browser = user instanceof Browser ? user : user.browser;
  return browser.post('/v1/hunt/settings', body);
}

function region(state: GameState, id = CAMPOS) {
  return state.waves.regions.find((r) => r.regionId === id)!;
}

async function balances(accountId: string) {
  const rows = await ctx.prisma.walletBalance.findMany({ where: { accountId } });
  const get = (c: string) => rows.find((r) => r.currency === c)?.amount ?? 0n;
  return { gold: get('GOLD'), essence: get('ESSENCE') };
}

/** O saldo é exatamente a soma do livro-razão, e nenhuma chave de idempotência se repete. */
async function expectLedgerConsistent(accountId: string) {
  const entries = await ctx.prisma.ledgerEntry.findMany({ where: { accountId } });
  const sum = (c: string) =>
    entries.filter((e) => e.currency === c).reduce((s, e) => s + e.delta, 0n);
  const b = await balances(accountId);
  expect(b.gold).toBe(sum('GOLD'));
  expect(b.essence).toBe(sum('ESSENCE'));
  const keys = entries.map((e) => e.idempotencyKey);
  expect(new Set(keys).size).toBe(keys.length);
}

type Tx = Parameters<typeof lockCharacter>[0];
type Char = Awaited<ReturnType<typeof lockCharacter>>;

/** Executa com o personagem travado e um relógio controlado pelo teste. */
function inTx<T>(accountId: string, fn: (tx: Tx, c: Char) => Promise<T>) {
  return ctx.prisma.$transaction(async (tx) => fn(tx, await lockCharacter(tx, accountId)), {
    timeout: 20_000,
  });
}

describe('estado inicial e modo Avançar', () => {
  it('uma caçada nova começa em Avançar, wave 1, com as 3 regiões no estado', async () => {
    const { user } = await hunter();
    const body = await sync(user);
    expect(body.state.waves.winsPerWave).toBe(15);
    expect(body.state.waves.regions.map((r) => r.regionId)).toEqual([
      CAMPOS,
      BOSQUE,
      'desfiladeiro-dos-trovoes',
    ]);
    expect(region(body.state)).toMatchObject({
      mode: 'advance',
      wave: 1,
      waveWins: 0,
      highestCleared: 0,
      unlockedWave: 1,
      waveCount: 10,
      notice: null,
    });
    expect(body.state.waves.lastClear).toBeNull();
  });

  it('conclui cada wave com exatamente 15 vitórias e avança automaticamente', async () => {
    const { user, characterId } = await hunter();
    await rewindHunt(ctx.prisma, characterId, 30 * MIN);
    const body = await sync(user);
    const clears = await ctx.prisma.waveClear.findMany({
      where: { characterId },
      orderBy: { encounterIndex: 'asc' },
    });
    expect(clears.length).toBeGreaterThanOrEqual(3);
    let farming = false;
    for (const c of clears) {
      expect(c.wins).toBe(WAVE_RULES.winsPerWave);
      expect(c.mode).toBe(farming ? 'FARM' : 'ADVANCE');
      // Avança para a próxima; repete se o nível ainda não permite a seguinte; ao fim do
      // conteúdo implementado, passa a farmar a última wave.
      if (c.nextReason === 'advance') expect(c.nextWave).toBe(c.wave + 1);
      else if (c.nextReason === 'level_gate') expect(c.nextWave).toBe(c.wave);
      else {
        expect(c).toMatchObject({ nextReason: 'content_limit', nextWave: 10, nextMode: 'FARM' });
        farming = true;
      }
    }
    const first = clears.filter((c) => c.firstClear);
    expect(first.map((c) => c.wave)).toEqual(first.map((_, i) => i + 1));
    expect(clears.filter((c) => !c.firstClear).every((c) => c.firstClearGold === 0n)).toBe(true);
    const r = region(body.state);
    expect(r.highestCleared).toBe(first.length);
    expect(r.wave).toBe(clears.at(-1)!.nextWave);
    expect(r.totalClears).toBe(clears.length);
    expect(body.settlement!.wavesCleared).toBe(clears.length);
    expect(body.waveClears.map((c) => c.wave)).toEqual(clears.map((c) => c.wave));
    expect(body.state.waves.lastClear?.wave).toBe(clears.at(-1)!.wave);
    // Vitórias da wave atual: total de vitórias menos as já usadas nas waves concluídas.
    expect(r.waveWins).toBe(body.settlement!.wins - clears.length * WAVE_RULES.winsPerWave);
  });

  it('elite na wave 5 e chefe na wave 10 pagam a primeira conclusão uma única vez; depois farma a última', async () => {
    const { user, characterId } = await hunter();
    await rewindHunt(ctx.prisma, characterId, 3 * HOUR);
    const body = await sync(user);
    const clears = await ctx.prisma.waveClear.findMany({
      where: { characterId },
      orderBy: { encounterIndex: 'asc' },
    });
    const first = clears.filter((c) => c.firstClear);
    expect(first.map((c) => c.wave)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(first.find((c) => c.wave === 5)).toMatchObject({
      kind: 'elite',
      firstClearRarity: 'rare',
    });
    expect(first.find((c) => c.wave === 10)).toMatchObject({
      kind: 'boss',
      firstClearRarity: 'epic',
      nextMode: 'FARM',
      nextWave: 10,
      nextReason: 'content_limit',
    });
    // Repetições (por limite de nível ou de conteúdo) não pagam a primeira conclusão de novo.
    const repeats = clears.filter((c) => !c.firstClear);
    expect(repeats.length).toBeGreaterThan(0);
    for (const c of repeats) expect(c).toMatchObject({ firstClearGold: 0n, firstClearEssence: 0n });
    const afterBoss = clears.filter((c) => c.encounterIndex > first.at(-1)!.encounterIndex);
    expect(afterBoss.length).toBeGreaterThan(0);
    for (const c of afterBoss) expect(c).toMatchObject({ wave: 10, mode: 'FARM' });
    expect(region(body.state)).toMatchObject({
      mode: 'farm',
      wave: 10,
      highestCleared: 10,
      notice: { type: 'content_limit', wave: 10 },
    });

    const rewards = await ctx.prisma.itemInstance.findMany({
      where: { ownerCharacterId: characterId, source: 'WAVE_REWARD' },
      orderBy: { sourceRef: 'asc' },
    });
    expect(rewards.map((i) => [i.sourceRef, i.rarity, i.tradable])).toEqual([
      [firstClearKey(characterId, CAMPOS, 10), 'epic', false],
      [firstClearKey(characterId, CAMPOS, 5), 'rare', false],
    ]);
    const firstClearLedger = await ctx.prisma.ledgerEntry.findMany({
      where: { accountId: user.accountId, reason: 'WAVE_FIRST_CLEAR' },
    });
    const goldPaid = firstClearLedger
      .filter((e) => e.currency === 'GOLD')
      .reduce((s, e) => s + e.delta, 0n);
    expect(goldPaid).toBe(first.reduce((s, c) => s + c.firstClearGold, 0n));
    expect(firstClearLedger.filter((e) => e.currency === 'GOLD')).toHaveLength(10);
    await expectLedgerConsistent(user.accountId);
  });

  it('derrotas não contam como vitória nem avançam a wave', async () => {
    // Arcanista lunar no nível 1 contra o Desfiladeiro seria impossível; usamos o elite
    // dos Campos com nível baixo forçado para garantir derrotas registradas.
    const { user, characterId } = await hunter('arcanist', 'storm');
    await rewindHunt(ctx.prisma, characterId, 2 * HOUR);
    await sync(user);
    const clears = await ctx.prisma.waveClear.findMany({ where: { characterId } });
    const settlements = await ctx.prisma.huntSettlement.findMany({ where: { characterId } });
    const wins = settlements.reduce((s, r) => s + r.wins, 0);
    const progress = await ctx.prisma.regionProgress.findUniqueOrThrow({
      where: { characterId_regionId: { characterId, regionId: CAMPOS } },
    });
    // Toda vitória está numa wave concluída ou na contagem da wave atual; derrotas não.
    expect(wins).toBe(clears.reduce((s, c) => s + c.wins, 0) + progress.waveWins);
    for (const c of clears) expect(c.wins).toBe(WAVE_RULES.winsPerWave);
  });
});

describe('modo Farmar e troca de modo', () => {
  it('alternar o modo no meio da wave mantém a wave e as vitórias, aplica a fronteira e audita', async () => {
    const { user, characterId } = await hunter();
    // Avança o tempo até haver vitórias parciais na wave atual (depende da semente).
    let before = await sync(user);
    for (let i = 0; i < 20 && region(before.state).waveWins === 0; i += 1) {
      await rewindHunt(ctx.prisma, characterId, 30_000);
      before = await sync(user);
    }
    const r0 = region(before.state);
    expect(r0.waveWins).toBeGreaterThan(0);
    expect(r0.waveWins).toBeLessThan(15);

    const res = await settings(user, { regionId: CAMPOS, mode: 'farm' });
    expect(res.statusCode).toBe(200);
    const body = syncResponseSchema.parse(res.json());
    const r1 = region(body.state);
    expect(r1.mode).toBe('farm');
    expect(r1.wave).toBe(r0.wave);
    expect(r1.waveWins).toBe(r0.waveWins);

    const hunt = await ctx.prisma.huntSession.findUniqueOrThrow({ where: { characterId } });
    const commands = await ctx.prisma.huntCommand.findMany({
      where: { characterId },
      orderBy: { id: 'asc' },
    });
    expect(commands.map((c) => c.command)).toEqual(['start', 'settings']);
    const cmd = commands[1]!;
    expect(cmd.atEncounter).toBe(hunt.encountersResolved);
    expect(cmd.runId).toBe(hunt.runId);
    expect(cmd.fromState).toMatchObject({ mode: 'advance', wave: r0.wave });
    expect(cmd.toState).toMatchObject({ mode: 'farm', wave: r0.wave, wins: r0.waveWins });
    // Fronteira: o próximo encontro começa exatamente no instante do comando.
    expect(hunt.lastSettledAt.getTime()).toBe(cmd.appliedAt.getTime());

    // Voltar para Avançar também não perde nada.
    const back = syncResponseSchema.parse(
      (await settings(user, { regionId: CAMPOS, mode: 'advance' })).json(),
    );
    expect(region(back.state)).toMatchObject({
      mode: 'advance',
      wave: r0.wave,
      waveWins: r1.waveWins,
    });
  });

  it('Farmar repete a wave escolhida sem recompensa de primeira conclusão', async () => {
    const { user, characterId } = await hunter();
    await rewindHunt(ctx.prisma, characterId, 40 * MIN);
    const advanced = await sync(user);
    const highest = region(advanced.state).highestCleared;
    expect(highest).toBeGreaterThanOrEqual(2);
    const firstClearBefore = await ctx.prisma.ledgerEntry.count({
      where: { accountId: user.accountId, reason: 'WAVE_FIRST_CLEAR' },
    });

    const res = await settings(user, { regionId: CAMPOS, mode: 'farm', wave: 1 });
    expect(res.statusCode).toBe(200);
    expect(region(syncResponseSchema.parse(res.json()).state)).toMatchObject({
      mode: 'farm',
      wave: 1,
      waveWins: 0,
      highestCleared: highest,
    });

    await rewindHunt(ctx.prisma, characterId, 30 * MIN);
    const farmed = await sync(user);
    const clears = farmed.waveClears;
    expect(clears.length).toBeGreaterThanOrEqual(2);
    for (const c of clears) {
      expect(c).toMatchObject({ wave: 1, mode: 'farm', firstClear: false, firstClearReward: null });
      expect(c.next).toMatchObject({ mode: 'farm', wave: 1, reason: 'repeat' });
    }
    expect(region(farmed.state)).toMatchObject({ mode: 'farm', wave: 1, highestCleared: highest });
    expect(farmed.settlement!.firstClears).toBe(0);
    expect(
      await ctx.prisma.ledgerEntry.count({
        where: { accountId: user.accountId, reason: 'WAVE_FIRST_CLEAR' },
      }),
    ).toBe(firstClearBefore);
    await expectLedgerConsistent(user.accountId);
  });

  it('recusa waves bloqueadas, inexistentes ou acima do nível', async () => {
    const { user, characterId } = await hunter();
    const locked = await settings(user, { regionId: CAMPOS, wave: 3 });
    expect(locked.statusCode).toBe(403);
    expect(locked.json().error.code).toBe('WAVE_LOCKED');

    const missing = await settings(user, { regionId: CAMPOS, wave: 11 });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe('WAVE_INVALID');

    const empty = await settings(user, { regionId: CAMPOS });
    expect(empty.statusCode).toBe(400);
    const badMode = await settings(user, { regionId: CAMPOS, mode: 'turbo' });
    expect(badMode.statusCode).toBe(400);
    const extra = await settings(user, { regionId: CAMPOS, mode: 'farm', wins: 14 });
    expect(extra.statusCode).toBe(400);

    // Wave desbloqueada pela progressão, mas acima do nível do personagem (nível 1).
    await ctx.prisma.regionProgress.update({
      where: { characterId_regionId: { characterId, regionId: CAMPOS } },
      data: { highestCleared: 9 },
    });
    const gated = await settings(user, { regionId: CAMPOS, wave: 10 });
    expect(gated.statusCode).toBe(403);
    expect(gated.json().error.message).toMatch(/nível 6/);

    // Região bloqueada pelo nível.
    const region2 = await settings(user, { regionId: BOSQUE, mode: 'farm' });
    expect(region2.statusCode).toBe(403);
    expect(region2.json().error.code).toBe('REGION_LOCKED');

    // Nenhuma recusa altera o progresso ou gera comando.
    const progress = await ctx.prisma.regionProgress.findUniqueOrThrow({
      where: { characterId_regionId: { characterId, regionId: CAMPOS } },
    });
    expect(progress).toMatchObject({ mode: 'ADVANCE', wave: 1 });
    expect(
      await ctx.prisma.huntCommand.count({ where: { characterId, command: 'settings' } }),
    ).toBe(0);
  });

  it('pedido igual ao estado atual não muda nada (idempotente)', async () => {
    const { user, characterId } = await hunter();
    const hunt0 = await ctx.prisma.huntSession.findUniqueOrThrow({ where: { characterId } });
    const res = await settings(user, { regionId: CAMPOS, mode: 'advance', wave: 1 });
    expect(res.statusCode).toBe(200);
    const hunt1 = await ctx.prisma.huntSession.findUniqueOrThrow({ where: { characterId } });
    expect(hunt1.version).toBe(hunt0.version);
    expect(
      await ctx.prisma.huntCommand.count({ where: { characterId, command: 'settings' } }),
    ).toBe(0);
  });
});

describe('regiões independentes', () => {
  it('cada região guarda seu modo, wave e histórico', async () => {
    const { user, characterId } = await hunter();
    await rewindHunt(ctx.prisma, characterId, 40 * MIN);
    const campos = region((await sync(user)).state);
    expect(campos.highestCleared).toBeGreaterThan(0);
    await ctx.prisma.character.update({ where: { id: characterId }, data: { level: 6 } });

    // Preferência para o Bosque sem caçar lá: grava, sem tocar na caçada dos Campos.
    const huntBefore = await ctx.prisma.huntSession.findUniqueOrThrow({ where: { characterId } });
    const pref = await settings(user, { regionId: BOSQUE, mode: 'farm' });
    expect(pref.statusCode).toBe(200);
    const huntAfter = await ctx.prisma.huntSession.findUniqueOrThrow({ where: { characterId } });
    expect(huntAfter.lastSettledAt).toEqual(huntBefore.lastSettledAt);
    const command = await ctx.prisma.huntCommand.findFirstOrThrow({
      where: { characterId, regionId: BOSQUE },
    });
    expect(command.runId).toBeNull();

    // Trocar para o Bosque retoma a preferência salva; os Campos ficam intactos.
    const moved = syncResponseSchema.parse(
      (await user.browser.post('/v1/hunt/start', { regionId: BOSQUE })).json(),
    );
    expect(region(moved.state, BOSQUE)).toMatchObject({ mode: 'farm', wave: 1, highestCleared: 0 });
    expect(region(moved.state, CAMPOS)).toMatchObject({
      mode: campos.mode,
      wave: campos.wave,
      highestCleared: campos.highestCleared,
      waveWins: campos.waveWins,
    });

    await rewindHunt(ctx.prisma, characterId, 20 * MIN);
    const bosque = await sync(user);
    expect(region(bosque.state, CAMPOS).highestCleared).toBe(campos.highestCleared);
    // Voltar aos Campos continua de onde parou.
    const back = syncResponseSchema.parse(
      (await user.browser.post('/v1/hunt/start', { regionId: CAMPOS })).json(),
    );
    expect(region(back.state, CAMPOS)).toMatchObject({
      wave: campos.wave,
      waveWins: campos.waveWins,
    });
    expect(back.state.hunt).toMatchObject({ regionId: CAMPOS, encountersResolved: 0 });
  });
});

describe('integridade', () => {
  it('offline entre várias waves respeita o teto de 8 h', async () => {
    const { user, characterId } = await hunter('guardian', 'solar');
    await rewindHunt(ctx.prisma, characterId, 30 * HOUR);
    const body = await sync(user);
    const s = body.settlement!;
    const window = new Date(s.windowEnd).getTime() - new Date(s.windowStart).getTime();
    expect(window).toBeLessThanOrEqual(OFFLINE_CAP_MS);
    expect(s.forfeitedMs).toBeGreaterThan(21 * HOUR);
    expect(s.wavesCleared).toBeGreaterThanOrEqual(10);
    expect(s.firstClears).toBe(10);
    await expectLedgerConsistent(user.accountId);
  });

  it('liquidar de uma vez ou em partes, com os mesmos comandos nos mesmos instantes, dá o mesmo resultado', async () => {
    const a = await hunter('guardian', 'storm');
    const b = await hunter('guardian', 'storm');
    const t0 = new Date(Date.now() - 4 * HOUR);
    for (const { characterId } of [a, b]) {
      await ctx.prisma.huntSession.update({
        where: { characterId },
        data: { seed: 1_234_567n, startedAt: t0, lastSettledAt: t0 },
      });
    }
    const config = testConfig();
    const at = (min: number) => new Date(t0.getTime() + min * MIN);
    const settleAt = (accountId: string, now: Date) =>
      inTx(accountId, (tx, c) => settleActiveHunt(tx, c, config, now));
    const cmd = (
      accountId: string,
      now: Date,
      input: { mode?: 'farm' | 'advance'; wave?: number },
    ) =>
      inTx(accountId, (tx, c) =>
        changeHuntSettings(tx, c, { regionId: CAMPOS, ...input }, config, { now }),
      );

    // Mesma sequência de comandos lógicos: Farmar aos 50 min, wave 2 aos 80, Avançar aos 120.
    // A consulta de A só acontece nos comandos; B consulta dezenas de vezes no meio.
    await cmd(a.user.accountId, at(50), { mode: 'farm' });
    await cmd(a.user.accountId, at(80), { wave: 2 });
    await cmd(a.user.accountId, at(120), { mode: 'advance' });
    await settleAt(a.user.accountId, at(200));

    for (const m of [3, 11, 17, 29, 41, 49]) await settleAt(b.user.accountId, at(m));
    await cmd(b.user.accountId, at(50), { mode: 'farm' });
    for (const m of [52, 63, 79]) await settleAt(b.user.accountId, at(m));
    await cmd(b.user.accountId, at(80), { wave: 2 });
    for (const m of [81, 99, 101, 119]) await settleAt(b.user.accountId, at(m));
    await cmd(b.user.accountId, at(120), { mode: 'advance' });
    for (const m of [121, 150, 151, 177, 199]) await settleAt(b.user.accountId, at(m));
    await settleAt(b.user.accountId, at(200));

    const snapshot = async (h: { user: TestUser; characterId: string }) => {
      const [character, progress, hunt, clears, items] = await Promise.all([
        ctx.prisma.character.findUniqueOrThrow({ where: { id: h.characterId } }),
        ctx.prisma.regionProgress.findUniqueOrThrow({
          where: { characterId_regionId: { characterId: h.characterId, regionId: CAMPOS } },
        }),
        ctx.prisma.huntSession.findUniqueOrThrow({ where: { characterId: h.characterId } }),
        ctx.prisma.waveClear.findMany({
          where: { characterId: h.characterId },
          orderBy: { encounterIndex: 'asc' },
        }),
        ctx.prisma.itemInstance.findMany({ where: { ownerCharacterId: h.characterId } }),
      ]);
      return {
        level: character.level,
        xp: character.xp,
        wallet: await balances(h.user.accountId),
        progress: {
          ...progress,
          characterId: null,
          version: null,
          updatedAt: null,
          createdAt: null,
        },
        encounters: hunt.encountersResolved,
        lastSettledAt: hunt.lastSettledAt.getTime(),
        clears: clears.map((c) => [c.wave, c.mode, c.encounterIndex, c.firstClear, c.xp, c.gold]),
        items: items
          .map(
            (i) =>
              // O item inicial tem referência própria (aleatória); os demais são determinísticos.
              `${i.source}:${i.source === 'QUEST' ? '-' : i.sourceRef?.split(':').at(-1)}:${i.defId}:${i.rarity}:${JSON.stringify(i.bonuses)}`,
          )
          .sort(),
      };
    };
    const [sa, sb] = [await snapshot(a), await snapshot(b)];
    expect(sa.clears.length).toBeGreaterThan(3);
    expect(sb).toEqual(sa);
  });

  it('caçadas anteriores às waves continuam como Farmar wave 1, idênticas à Fase 1', async () => {
    const { user, characterId } = await hunter('arcanist');
    // Simula a migração: caçada ativa sem progresso registrado.
    await ctx.prisma.regionProgress.deleteMany({ where: { characterId } });
    await rewindHunt(ctx.prisma, characterId, 30 * MIN);
    const hunt = await ctx.prisma.huntSession.findUniqueOrThrow({ where: { characterId } });
    const body = await sync(user);
    const persisted = await ctx.prisma.huntSession.findUniqueOrThrow({ where: { characterId } });
    const phase1 = settleHunt({
      regionId: hunt.regionId,
      seed: Number(hunt.seed),
      nextEncounter: 0,
      lastSettledAtMs: hunt.lastSettledAt.getTime(),
      nowMs: persisted.lastSettledAt.getTime(),
      character: { classId: 'arcanist', affinity: 'lunar', level: 1, xp: 0, equipment: [] },
    });
    expect(body.settlement!.toEncounter).toBe(phase1.nextEncounter);
    expect(body.settlement!.gold).toBe(String(phase1.gold));
    expect(body.settlement!.xpGained).toBe(phase1.xpGained);
    expect(region(body.state).mode).toBe(LEGACY_WAVE_PROGRESS.mode);
    expect(region(body.state).wave).toBe(1);
  });

  it('trocas simultâneas de várias abas são serializadas e auditadas em cadeia', async () => {
    const { user, characterId } = await hunter();
    await rewindHunt(ctx.prisma, characterId, 40 * MIN);
    const tabs = [user.browser, ...Array.from({ length: 3 }, () => clone(user.browser))];
    const requests = Array.from({ length: 12 }, (_, i) =>
      i % 3 === 2
        ? tabs[i % tabs.length]!.post('/v1/hunt/sync')
        : settings(tabs[i % tabs.length]!, {
            regionId: CAMPOS,
            mode: i % 2 === 0 ? 'farm' : 'advance',
          }),
    );
    const results = await Promise.all(requests);
    expect(results.map((r) => r.statusCode).every((code) => code === 200)).toBe(true);

    const commands = await ctx.prisma.huntCommand.findMany({
      where: { characterId, command: 'settings' },
      orderBy: { id: 'asc' },
    });
    expect(commands.length).toBeGreaterThan(0);
    // Cada troca parte exatamente do estado deixado pela anterior.
    for (let i = 1; i < commands.length; i += 1) {
      expect((commands[i]!.fromState as { mode: string }).mode).toBe(
        (commands[i - 1]!.toState as { mode: string }).mode,
      );
    }
    // Liquidações contíguas, sem sobreposição, e nenhuma recompensa duplicada.
    const rows = await ctx.prisma.huntSettlement.findMany({
      where: { characterId },
      orderBy: { fromEncounter: 'asc' },
    });
    for (let i = 1; i < rows.length; i += 1)
      expect(rows[i]!.fromEncounter).toBe(rows[i - 1]!.toEncounter);
    await expectLedgerConsistent(user.accountId);

    // As duas abas enxergam o mesmo estado final.
    const [s1, s2] = await Promise.all([sync(tabs[0]!), sync(tabs[1]!)]);
    expect(region(s2.state)).toEqual(region(s1.state));
    expect(region(s1.state).mode).toBe((commands.at(-1)!.toState as { mode: string }).mode);
  });

  it('liquidações simultâneas pagam cada primeira conclusão uma única vez', async () => {
    const { user, characterId } = await hunter();
    await rewindHunt(ctx.prisma, characterId, 3 * HOUR);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => user.browser.post('/v1/hunt/sync')),
    );
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    const firstClears = await ctx.prisma.waveClear.groupBy({
      by: ['wave'],
      where: { characterId, firstClear: true },
      _count: true,
    });
    expect(firstClears.every((g) => g._count === 1)).toBe(true);
    expect(firstClears).toHaveLength(10);
    const rewards = await ctx.prisma.itemInstance.count({
      where: { ownerCharacterId: characterId, source: 'WAVE_REWARD' },
    });
    expect(rewards).toBe(2);
    await expectLedgerConsistent(user.accountId);
  });

  it('o banco rejeita uma segunda primeira conclusão da mesma wave', async () => {
    const { user, characterId } = await hunter();
    await rewindHunt(ctx.prisma, characterId, 20 * MIN);
    await sync(user);
    const clear = await ctx.prisma.waveClear.findFirstOrThrow({
      where: { characterId, firstClear: true },
    });
    const { id: _id, ...copy } = clear;
    await expect(
      ctx.prisma.waveClear.create({
        data: { ...copy, encounterIndex: clear.encounterIndex + 1_000 },
      }),
    ).rejects.toThrow();
    await expect(
      ctx.prisma.waveClear.update({
        where: { id: clear.id },
        data: { firstClearGold: 1_000_000n },
      }),
    ).rejects.toThrow();
    const cmd = await ctx.prisma.huntCommand.findFirstOrThrow({ where: { characterId } });
    await expect(
      ctx.prisma.huntCommand.update({ where: { id: cmd.id }, data: { command: 'stop' } }),
    ).rejects.toThrow();
  });

  it('a troca de modo não altera liquidações passadas nem o índice do próximo encontro (sem reroll)', async () => {
    const { user, characterId } = await hunter();
    await rewindHunt(ctx.prisma, characterId, 10 * MIN);
    await sync(user);
    const before = await ctx.prisma.huntSettlement.findMany({ where: { characterId } });
    const hunt0 = await ctx.prisma.huntSession.findUniqueOrThrow({ where: { characterId } });
    for (const mode of ['farm', 'advance', 'farm', 'advance'] as const) {
      expect((await settings(user, { regionId: CAMPOS, mode })).statusCode).toBe(200);
    }
    const hunt1 = await ctx.prisma.huntSession.findUniqueOrThrow({ where: { characterId } });
    const after = await ctx.prisma.huntSettlement.findMany({ where: { characterId } });
    // Nenhum encontro foi pulado ou ressorteado: o próximo continua sendo o mesmo índice.
    expect(hunt1.encountersResolved).toBe(hunt0.encountersResolved);
    expect(hunt1.seed).toBe(hunt0.seed);
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it('parar e reiniciar registram comandos e preservam o progresso', async () => {
    const { user, characterId } = await hunter();
    await rewindHunt(ctx.prisma, characterId, 20 * MIN);
    const stop = syncResponseSchema.parse((await user.browser.post('/v1/hunt/stop')).json());
    const r = region(stop.state);
    const restart = syncResponseSchema.parse(
      (await user.browser.post('/v1/hunt/start', { regionId: CAMPOS })).json(),
    );
    expect(region(restart.state)).toMatchObject({
      wave: r.wave,
      waveWins: r.waveWins,
      mode: r.mode,
    });
    const commands = await ctx.prisma.huntCommand.findMany({
      where: { characterId },
      orderBy: { id: 'asc' },
    });
    expect(commands.map((c) => c.command)).toEqual(['start', 'stop', 'start']);
  });

  it('start com modo e wave aplica as escolhas na nova caçada', async () => {
    const { user, characterId } = await hunter();
    await rewindHunt(ctx.prisma, characterId, 40 * MIN);
    const progressed = region((await sync(user)).state);
    await user.browser.post('/v1/hunt/stop');
    const res = await user.browser.post('/v1/hunt/start', {
      regionId: CAMPOS,
      mode: 'farm',
      wave: 2,
    });
    expect(res.statusCode).toBe(200);
    expect(region(syncResponseSchema.parse(res.json()).state)).toMatchObject({
      mode: 'farm',
      wave: 2,
      waveWins: 0,
    });
    const locked = await user.browser.post('/v1/hunt/start', {
      regionId: CAMPOS,
      wave: progressed.unlockedWave + 1,
    });
    expect(locked.statusCode).toBe(progressed.unlockedWave + 1 > 10 ? 400 : 403);
  });

  it('o servidor reinicia e a caçada continua exatamente de onde parou', async () => {
    const { user, characterId } = await hunter('blade', 'solar');
    const t0 = Date.now() - 90 * MIN;
    const hunt = await ctx.prisma.huntSession.update({
      where: { characterId },
      data: { startedAt: new Date(t0), lastSettledAt: new Date(t0) },
    });
    // A primeira instância liquidou 45 min e então "caiu".
    await inTx(user.accountId, (tx, c) =>
      settleActiveHunt(tx, c, testConfig(), new Date(t0 + 45 * MIN)),
    );

    const second = await setupApp();
    try {
      const tab = new Browser(second.app);
      for (const [k, v] of user.browser.cookies) tab.cookies.set(k, v);
      const body = await sync(tab);
      const persisted = await second.prisma.huntSession.findUniqueOrThrow({
        where: { characterId },
      });
      const expected = settleHunt({
        regionId: CAMPOS,
        seed: Number(hunt.seed),
        nextEncounter: 0,
        lastSettledAtMs: t0,
        nowMs: persisted.lastSettledAt.getTime(),
        character: { classId: 'blade', affinity: 'solar', level: 1, xp: 0, equipment: [] },
        progress: initialWaveProgress('advance', 1, 0),
      });
      expect(body.state.hunt!.encountersResolved).toBe(expected.nextEncounter);
      expect(body.state.character).toMatchObject({ level: expected.level, xp: expected.xp });
      expect(region(body.state)).toMatchObject({
        wave: expected.progress.wave,
        waveWins: expected.progress.wins,
        highestCleared: expected.progress.highestCleared,
      });
      expect((await balances(user.accountId)).gold).toBe(
        BigInt(expected.gold + expected.firstClearGold),
      );
    } finally {
      await second.close();
    }
  });

  it('a outra aba recebe a notificação quando o modo muda', async () => {
    const { user } = await hunter();
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
    await settings(clone(user.browser), { regionId: CAMPOS, mode: 'farm' });
    const deadline = Date.now() + 2_000;
    while (!messages.some((m) => m.type === 'state.changed') && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(messages.find((m) => m.type === 'state.changed')).toMatchObject({ reason: 'hunt' });
    ws.terminate();
  });
});

describe('comandos de equipamento e inventário', () => {
  async function twins(classId: 'guardian' | 'blade' = 'blade') {
    const a = await hunter(classId, 'lunar');
    const b = await hunter(classId, 'lunar');
    const t0 = new Date(Date.now() - 4 * HOUR);
    for (const { characterId } of [a, b]) {
      await ctx.prisma.huntSession.update({
        where: { characterId },
        data: { seed: 424_242n, startedAt: t0, lastSettledAt: t0 },
      });
    }
    return { a, b, at: (min: number) => new Date(t0.getTime() + min * MIN) };
  }
  const starterOf = (characterId: string) =>
    ctx.prisma.itemInstance.findFirstOrThrow({
      where: { ownerCharacterId: characterId, source: 'QUEST' },
    });
  const dropsOf = async (characterId: string) =>
    (
      await ctx.prisma.itemInstance.findMany({
        where: { ownerCharacterId: characterId, source: { in: ['DROP', 'WAVE_REWARD'] } },
      })
    )
      .map((i) => `${i.source}:${i.sourceRef!.split(':').at(-1)}:${i.defId}:${i.rarity}`)
      .sort();

  it('trocar equipamento num instante fixo dá o mesmo resultado com qualquer frequência de consulta', async () => {
    const { a, b, at } = await twins();
    const config = testConfig();
    const equipAt = async (h: { user: TestUser; characterId: string }, now: Date) => {
      const starter = await starterOf(h.characterId);
      return inTx(h.user.accountId, (tx, c) => equipItem(tx, c, starter.id, config, { now }));
    };
    const settleAt = (h: { user: TestUser }, now: Date) =>
      inTx(h.user.accountId, (tx, c) => settleActiveHunt(tx, c, config, now));

    await equipAt(a, at(30));
    await settleAt(a, at(90));
    for (const m of [4, 9, 22, 29]) await settleAt(b, at(m));
    await equipAt(b, at(30));
    for (const m of [31, 44, 61, 77, 89]) await settleAt(b, at(m));
    await settleAt(b, at(90));

    const state = async (h: { user: TestUser; characterId: string }) => {
      const [c, hunt, p] = await Promise.all([
        ctx.prisma.character.findUniqueOrThrow({ where: { id: h.characterId } }),
        ctx.prisma.huntSession.findUniqueOrThrow({ where: { characterId: h.characterId } }),
        ctx.prisma.regionProgress.findUniqueOrThrow({
          where: { characterId_regionId: { characterId: h.characterId, regionId: CAMPOS } },
        }),
      ]);
      return {
        level: c.level,
        xp: c.xp,
        wallet: await balances(h.user.accountId),
        encounters: hunt.encountersResolved,
        lastSettledAt: hunt.lastSettledAt.getTime(),
        wave: [p.wave, p.waveWins, p.highestCleared, p.mode],
        drops: await dropsOf(h.characterId),
      };
    };
    expect(await state(b)).toEqual(await state(a));

    // A troca de equipamento fica auditada com o encontro em que foi aplicada.
    const cmd = await ctx.prisma.huntCommand.findFirstOrThrow({
      where: { characterId: a.characterId, command: 'equipment' },
    });
    const starter = await starterOf(a.characterId);
    expect(cmd.fromState).toEqual({ slot: 'weapon', itemId: null });
    expect(cmd.toState).toEqual({ slot: 'weapon', itemId: starter.id });
    expect(cmd.appliedAt.getTime()).toBe(at(30).getTime());
  });

  it('descartar antes de sincronizar não salva drops que já teriam sido perdidos', async () => {
    const small = await setupApp({ INVENTORY_CAPACITY: '10' });
    const local = ctx;
    ctx = small;
    try {
      const { a, b, at } = await twins('guardian');
      const config = testConfig({ INVENTORY_CAPACITY: '10' });
      const settleAt = (h: { user: TestUser }, now: Date) =>
        inTx(h.user.accountId, (tx, c) => settleActiveHunt(tx, c, config, now));
      const discardAt = async (h: { user: TestUser; characterId: string }, now: Date) => {
        const starter = await starterOf(h.characterId);
        return inTx(h.user.accountId, (tx, c) =>
          discardItem(tx, c, starter.id, config, { now, requestId: 'teste' }),
        );
      };

      // A consulta o tempo todo e o inventário enche cedo; B só aparece para descartar.
      for (const m of [10, 25, 40, 55, 70, 85, 100, 115]) await settleAt(a, at(m));
      await discardAt(a, at(120));
      await discardAt(b, at(120));
      await settleAt(a, at(150));
      await settleAt(b, at(150));

      const unequipped = (id: string) =>
        ctx.prisma.itemInstance.count({
          where: { ownerCharacterId: id, equippedSlot: null, source: 'DROP' },
        });
      expect(await unequipped(b.characterId)).toBe(await unequipped(a.characterId));
      expect(await dropsOf(b.characterId)).toEqual(await dropsOf(a.characterId));
    } finally {
      ctx = local;
      await small.close();
    }
  });

  it('trocar de região registra de onde o herói saiu', async () => {
    const { user, characterId } = await hunter();
    await rewindHunt(ctx.prisma, characterId, 20 * MIN);
    await sync(user);
    await ctx.prisma.character.update({ where: { id: characterId }, data: { level: 6 } });
    expect((await user.browser.post('/v1/hunt/start', { regionId: BOSQUE })).statusCode).toBe(200);
    // Os Campos foram liquidados até a troca e não mudam mais: é o estado de saída.
    const campos = await ctx.prisma.regionProgress.findUniqueOrThrow({
      where: { characterId_regionId: { characterId, regionId: CAMPOS } },
    });
    const cmd = await ctx.prisma.huntCommand.findFirstOrThrow({
      where: { characterId, command: 'start', regionId: BOSQUE },
    });
    expect(cmd.fromState).toEqual({
      status: 'ACTIVE',
      regionId: CAMPOS,
      mode: campos.mode.toLowerCase(),
      wave: campos.wave,
      wins: campos.waveWins,
      highestCleared: campos.highestCleared,
    });
    expect(cmd.toState).toMatchObject({ status: 'ACTIVE', regionId: BOSQUE, wave: 1 });
  });
});

describe('conteúdo público', () => {
  it('descreve as waves de cada região', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/content' });
    const campos = res.json().regions.find((r: { id: string }) => r.id === CAMPOS);
    expect(campos.waves).toMatchObject({ count: 10, winsPerWave: 15 });
    expect(campos.waves.elite.id).toBe('lobo-cometa-ancestral');
    expect(campos.waves.boss.id).toBe('colosso-do-eclipse-menor');
    expect(campos.waves.list[4]).toMatchObject({ wave: 5, kind: 'elite' });
    expect(campos.waves.list[9]).toMatchObject({ wave: 10, kind: 'boss', minLevel: 6 });
    const bosque = res.json().regions.find((r: { id: string }) => r.id === BOSQUE);
    expect(bosque.waves).toMatchObject({ count: 4, elite: null, boss: null });
  });
});

/** Outra aba do mesmo navegador: mesmos cookies, requisições independentes. */
function clone(browser: Browser): Browser {
  const tab = new Browser(browser.app, browser.ip);
  for (const [k, v] of browser.cookies) tab.cookies.set(k, v);
  return tab;
}
