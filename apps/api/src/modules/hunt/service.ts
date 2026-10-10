import { randomUUID } from 'node:crypto';
import {
  LEGACY_WAVE_PROGRESS,
  REGIONS,
  RULESET_VERSION,
  WaveSelectionError,
  applyWaveSettings,
  isRegionUnlocked,
  settleHunt,
  type EncounterSummary,
  type HuntMode,
  type WaveClearEvent,
  type WaveProgress,
  type WaveSettings,
} from '@astral/game-core';
import type { EncounterView, SettlementView, WaveClearView } from '@astral/shared';
import type { AppConfig } from '../../config/env.js';
import { AppError, notFound } from '../../http/errors.js';
import type {
  Character,
  HuntSettlement,
  Prisma,
  PrismaClient,
  WaveClear,
} from '../../generated/prisma/client.js';
import { randomSeed } from '../../lib/crypto.js';
import { applyLedgerEntryInTx } from '../economy/ledger.js';
import { encounterView, settlementView, toEquipped } from '../game/views.js';
import {
  getOrCreateProgress,
  saveProgress,
  toDbMode,
  toWaveProgress,
  waveClearView,
} from './waves.js';

type Tx = Prisma.TransactionClient;

/** Quantos encontros recentes acompanham cada resposta (histórico e animação). */
export const RECENT_ENCOUNTERS_IN_RESPONSE = 20;
/** Golpes individuais são enviados para os últimos encontros liquidados na própria requisição. */
const EVENTS_FOR_LAST = 3;

export interface SettleOutcome {
  settlement: HuntSettlement;
  /** Encontros desta liquidação, com golpes nos mais recentes (não persistidos). */
  encounters: EncounterView[];
  waveClears: WaveClear[];
}

export interface CommandContext {
  now: Date;
  requestId?: string;
}

export class HuntConflictError extends AppError {
  constructor() {
    super(409, 'HUNT_CONFLICT', 'A caçada foi atualizada por outra requisição; tente novamente');
  }
}

/** Chaves estáveis da primeira conclusão: valem para sempre, entre caçadas diferentes. */
export const firstClearKey = (characterId: string, regionId: string, wave: number) =>
  `waveclear:${characterId}:${regionId}:${wave}`;

/**
 * Liquida a caçada ativa até `now`, dentro de uma transação que já travou o personagem.
 * Atualiza nível/XP, progresso da wave, cria itens, credita moedas no livro-razão e
 * registra o resumo e as conclusões de wave.
 * Proteções contra duplicação (cada uma suficiente por si):
 *   1. trava do personagem (serializa liquidações da mesma conta);
 *   2. `version` condicional em `hunt_sessions`, `characters` e `region_progress`;
 *   3. chaves de idempotência do livro-razão (por intervalo de encontros e por wave);
 *   4. índices únicos: `hunt_settlements (run, from)`, `item_instances.source_ref`,
 *      `wave_clears (run, encounter)` e primeira conclusão única por (personagem, região, wave).
 */
export async function settleActiveHunt(
  tx: Tx,
  character: Character,
  config: AppConfig,
  now: Date,
): Promise<SettleOutcome | null> {
  const hunt = await tx.huntSession.findUnique({ where: { characterId: character.id } });
  if (!hunt || hunt.status !== 'ACTIVE') return null;

  // Caçadas sem progresso registrado (anteriores às waves) liquidam como "Farmar wave 1".
  const progressRow = await getOrCreateProgress(
    tx,
    character.id,
    hunt.regionId,
    LEGACY_WAVE_PROGRESS,
  );
  const equipped = await tx.itemInstance.findMany({
    where: { ownerCharacterId: character.id, equippedSlot: { not: null } },
  });
  const result = settleHunt({
    regionId: hunt.regionId,
    seed: Number(hunt.seed),
    nextEncounter: hunt.encountersResolved,
    lastSettledAtMs: hunt.lastSettledAt.getTime(),
    nowMs: now.getTime(),
    character: {
      classId: character.classId,
      affinity: character.affinity,
      level: character.level,
      xp: character.xp,
      equipment: equipped.map(toEquipped),
    },
    progress: toWaveProgress(progressRow),
    includeEventsForLast: EVENTS_FOR_LAST,
  });

  if (result.encounters === 0) {
    if (result.forfeitedMs > 0) {
      // Só descarta o tempo acima do teto offline; nenhum encontro terminou.
      await updateHuntCursor(tx, hunt.id, hunt.version, {
        lastSettledAt: new Date(result.windowStartMs),
      });
    }
    return null;
  }

  // Inventário cheio: os drops comuns excedentes são descartados (e contabilizados).
  // Itens de primeira conclusão são sempre entregues (são raros e exclusivos), mas ocupam
  // vaga. Drops e itens de wave são processados na ordem dos encontros, com um único
  // contador de vagas: assim liquidar de uma vez ou em partes guarda exatamente os mesmos itens.
  const unequipped = await tx.itemInstance.count({
    where: { ownerCharacterId: character.id, equippedSlot: null },
  });
  const clearEvents = result.waveEvents.filter((e): e is WaveClearEvent => e.type === 'clear');
  const firstClearAt = new Map(
    clearEvents.filter((e) => e.firstClear).map((e) => [e.wave, e.encounterIndex]),
  );
  const timeline = [
    ...result.drops.map((drop) => ({ index: drop.encounterIndex, order: 0, drop })),
    ...result.firstClearItems.map((item) => ({
      index: firstClearAt.get(item.wave) ?? Number.MAX_SAFE_INTEGER,
      order: 1,
      drop: null,
    })),
  ].sort((x, y) => x.index - y.index || x.order - y.order);
  let free = Math.max(0, config.INVENTORY_CAPACITY - unequipped);
  const kept: typeof result.drops = [];
  for (const entry of timeline) {
    if (entry.drop && free > 0) kept.push(entry.drop);
    // Drop guardado ou item de wave: consome uma vaga (se houver).
    if (!entry.drop || kept.at(-1) === entry.drop) free = Math.max(0, free - 1);
  }
  const keptIndexes = new Set(kept.map((d) => d.encounterIndex));
  // Itens de primeira conclusão são raros (no máximo um por wave) e sempre entregues,
  // mesmo acima da capacidade, para que a recompensa exclusiva nunca se perca.
  const items = [
    ...kept.map((drop) => ({
      ownerCharacterId: character.id,
      defId: drop.defId,
      rarity: drop.rarity,
      bonuses: drop.bonuses as Prisma.InputJsonObject,
      rulesetVersion: RULESET_VERSION,
      source: 'DROP' as const,
      sourceRef: `hunt:${hunt.runId}:enc:${drop.encounterIndex}`,
    })),
    ...result.firstClearItems.map((item) => ({
      ownerCharacterId: character.id,
      defId: item.defId,
      rarity: item.rarity,
      bonuses: item.bonuses as Prisma.InputJsonObject,
      rulesetVersion: RULESET_VERSION,
      source: 'WAVE_REWARD' as const,
      sourceRef: firstClearKey(character.id, hunt.regionId, item.wave),
      tradable: false,
    })),
  ];
  if (items.length > 0) await tx.itemInstance.createMany({ data: items });

  const range = `${result.fromEncounter}-${result.nextEncounter}`;
  const ref = { refType: 'hunt_settlement', refId: `${hunt.runId}:${result.fromEncounter}` };
  if (result.gold > 0) {
    await applyLedgerEntryInTx(tx, {
      accountId: character.accountId,
      currency: 'GOLD',
      delta: BigInt(result.gold),
      reason: 'HUNT_REWARD',
      idempotencyKey: `hunt:${hunt.runId}:${range}:GOLD`,
      ...ref,
    });
  }
  if (result.essence > 0) {
    await applyLedgerEntryInTx(tx, {
      accountId: character.accountId,
      currency: 'ESSENCE',
      delta: BigInt(result.essence),
      reason: 'HUNT_REWARD',
      idempotencyKey: `hunt:${hunt.runId}:${range}:ESSENCE`,
      ...ref,
    });
  }

  for (const e of clearEvents) {
    if (!e.firstClear || !e.firstClearReward) continue;
    const key = firstClearKey(character.id, hunt.regionId, e.wave);
    const clearRef = { refType: 'wave_clear', refId: `${hunt.runId}:${e.encounterIndex}` };
    if (e.firstClearReward.gold > 0) {
      await applyLedgerEntryInTx(tx, {
        accountId: character.accountId,
        currency: 'GOLD',
        delta: BigInt(e.firstClearReward.gold),
        reason: 'WAVE_FIRST_CLEAR',
        idempotencyKey: `${key}:GOLD`,
        ...clearRef,
      });
    }
    if (e.firstClearReward.essence > 0) {
      await applyLedgerEntryInTx(tx, {
        accountId: character.accountId,
        currency: 'ESSENCE',
        delta: BigInt(e.firstClearReward.essence),
        reason: 'WAVE_FIRST_CLEAR',
        idempotencyKey: `${key}:ESSENCE`,
        ...clearRef,
      });
    }
  }

  const charUpdate = await tx.character.updateMany({
    where: { id: character.id, version: character.version },
    data: { level: result.level, xp: result.xp, version: { increment: 1 } },
  });
  if (charUpdate.count !== 1) throw new HuntConflictError();

  await updateHuntCursor(tx, hunt.id, hunt.version, {
    lastSettledAt: new Date(result.windowEndMs),
    encountersResolved: result.nextEncounter,
  });
  await saveProgress(tx, progressRow, result.progress, {
    totalClearsIncrement: result.wavesCleared,
  });

  const waveClears =
    clearEvents.length === 0
      ? []
      : await tx.waveClear.createManyAndReturn({
          data: clearEvents.map((e) => ({
            characterId: character.id,
            regionId: hunt.regionId,
            runId: hunt.runId,
            wave: e.wave,
            kind: e.kind,
            mode: toDbMode(e.mode),
            encounterIndex: e.encounterIndex,
            firstClear: e.firstClear,
            wins: e.totals.wins,
            losses: e.totals.losses,
            xp: e.totals.xp,
            gold: BigInt(e.totals.gold),
            essence: BigInt(e.totals.essence),
            items: e.totals.items,
            firstClearGold: BigInt(e.firstClearReward?.gold ?? 0),
            firstClearEssence: BigInt(e.firstClearReward?.essence ?? 0),
            firstClearItemDef: e.firstClearReward?.item?.defId ?? null,
            firstClearRarity: e.firstClearReward?.item?.rarity ?? null,
            nextMode: toDbMode(e.next.mode),
            nextWave: e.next.wave,
            nextReason: e.next.reason,
            clearedAt: new Date(e.atMs),
          })),
        });
  waveClears.sort((a, b) => a.encounterIndex - b.encounterIndex);

  const views = result.recent.map((s) => encounterView(s, hunt.runId, keptIndexes));
  const settlement = await tx.huntSettlement.create({
    data: {
      characterId: character.id,
      runId: hunt.runId,
      regionId: hunt.regionId,
      fromEncounter: result.fromEncounter,
      toEncounter: result.nextEncounter,
      windowStart: new Date(result.windowStartMs),
      windowEnd: new Date(result.windowEndMs),
      forfeitedMs: BigInt(result.forfeitedMs),
      wins: result.wins,
      losses: result.losses,
      timeouts: result.timeouts,
      xpGained: result.xpGained,
      gold: BigInt(result.gold),
      essence: BigInt(result.essence),
      itemsDropped: result.drops.length,
      itemsDiscarded: result.drops.length - kept.length,
      levelBefore: result.levelBefore,
      levelAfter: result.level,
      // Os golpes individuais não são persistidos (são reproduzíveis pela semente).
      recent: views.map(stripEvents) as unknown as Prisma.InputJsonArray,
      rulesetVersion: RULESET_VERSION,
      waveBefore: result.progressBefore.wave,
      waveAfter: result.progress.wave,
      modeAfter: toDbMode(result.progress.mode),
      wavesCleared: result.wavesCleared,
      firstClears: result.firstClears,
      firstClearGold: BigInt(result.firstClearGold),
      firstClearEssence: BigInt(result.firstClearEssence),
      waveEvents: result.waveEvents.map((e) =>
        e.type === 'clear'
          ? {
              type: e.type,
              wave: e.wave,
              kind: e.kind,
              encounterIndex: e.encounterIndex,
              firstClear: e.firstClear,
              next: e.next,
            }
          : e,
      ) as unknown as Prisma.InputJsonArray,
    },
  });
  return { settlement, encounters: views, waveClears };
}

function stripEvents(view: EncounterView): EncounterView {
  const { events: _events, ...rest } = view;
  return rest;
}

async function updateHuntCursor(
  tx: Tx,
  huntId: string,
  version: number,
  data: { lastSettledAt: Date; encountersResolved?: number },
): Promise<void> {
  const updated = await tx.huntSession.updateMany({
    where: { id: huntId, version },
    data: { ...data, version: { increment: 1 } },
  });
  if (updated.count !== 1) throw new HuntConflictError();
}

/**
 * Fronteira de comando (ADR-08). Depois de liquidar até `now`, o encontro em andamento é
 * descartado e o próximo começa exatamente em `now`, já com os novos parâmetros. Assim
 * nenhum resultado calculado é alterado e o efeito do comando não depende de quantas vezes
 * o cliente consultou antes.
 */
export async function applyCommandBoundary(
  tx: Tx,
  characterId: string,
  now: Date,
): Promise<{ runId: string; regionId: string; atEncounter: number } | null> {
  const hunt = await tx.huntSession.findUnique({ where: { characterId } });
  if (!hunt || hunt.status !== 'ACTIVE') return null;
  if (hunt.lastSettledAt.getTime() < now.getTime()) {
    await updateHuntCursor(tx, hunt.id, hunt.version, { lastSettledAt: now });
  }
  return { runId: hunt.runId, regionId: hunt.regionId, atEncounter: hunt.encountersResolved };
}

function snapshot(p: WaveProgress) {
  return { mode: p.mode, wave: p.wave, wins: p.wins, highestCleared: p.highestCleared };
}

export async function recordCommand(
  tx: Tx,
  data: {
    characterId: string;
    regionId: string;
    runId: string | null;
    command: 'start' | 'stop' | 'settings' | 'equipment';
    atEncounter: number | null;
    from: unknown;
    to: unknown;
    ctx: CommandContext;
  },
): Promise<void> {
  await tx.huntCommand.create({
    data: {
      characterId: data.characterId,
      regionId: data.regionId,
      runId: data.runId,
      command: data.command,
      atEncounter: data.atEncounter,
      fromState: (data.from ?? undefined) as Prisma.InputJsonValue | undefined,
      toState: data.to as Prisma.InputJsonValue,
      appliedAt: data.ctx.now,
      requestId: data.ctx.requestId ?? null,
    },
  });
}

function regionOrThrow(regionId: string) {
  const region = REGIONS[regionId];
  if (!region) throw notFound('REGION_NOT_FOUND', 'Região não encontrada');
  return region;
}

function assertRegionUnlocked(regionId: string, level: number): void {
  const region = regionOrThrow(regionId);
  if (!isRegionUnlocked(region, level)) {
    throw new AppError(
      403,
      'REGION_LOCKED',
      `${region.name} é liberada a partir do nível ${region.minLevel}`,
    );
  }
}

/** Aplica as regras do game-core e traduz recusas em erros de API. */
function settingsOrThrow(
  regionId: string,
  current: WaveProgress,
  settings: WaveSettings,
  level: number,
) {
  try {
    return applyWaveSettings(regionOrThrow(regionId), current, settings, level);
  } catch (error) {
    if (!(error instanceof WaveSelectionError)) throw error;
    if (error.reason === 'level') {
      throw new AppError(403, 'WAVE_LOCKED', `Esta wave exige nível ${error.minLevel}`, {
        wave: `Exige nível ${error.minLevel}`,
      });
    }
    if (error.reason === 'locked') {
      throw new AppError(403, 'WAVE_LOCKED', 'Conclua a wave anterior para liberar esta', {
        wave: 'Wave ainda bloqueada',
      });
    }
    throw new AppError(400, 'WAVE_INVALID', 'Esta wave não existe nesta região', {
      wave: 'Wave inexistente',
    });
  }
}

export interface StartInput {
  regionId: string;
  mode?: HuntMode;
  wave?: number;
}

/**
 * Inicia uma caçada (ou troca de região). Retoma o progresso salvo da região; `mode` e
 * `wave` opcionais são aplicados antes de começar. Repetir o mesmo pedido não muda nada.
 */
export async function startHunt(
  tx: Tx,
  character: Character,
  input: StartInput,
  config: AppConfig,
  ctx: CommandContext,
): Promise<{ changed: boolean; settle: SettleOutcome | null }> {
  regionOrThrow(input.regionId);
  // Liquida a caçada atual primeiro: o progresso até agora é preservado.
  const settle = await settleActiveHunt(tx, character, config, ctx.now);
  const fresh = await tx.character.findUniqueOrThrow({ where: { id: character.id } });
  assertRegionUnlocked(input.regionId, fresh.level);

  const row = await getOrCreateProgress(tx, character.id, input.regionId);
  const before = toWaveProgress(row);
  const settings: WaveSettings = {
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.wave ? { wave: input.wave } : {}),
  };
  const { progress, changed: settingsChanged } = settingsOrThrow(
    input.regionId,
    before,
    settings,
    fresh.level,
  );

  const current = await tx.huntSession.findUnique({ where: { characterId: character.id } });
  const sameRegionActive = current?.status === 'ACTIVE' && current.regionId === input.regionId;

  if (sameRegionActive) {
    if (!settingsChanged) return { changed: false, settle };
    await saveProgress(tx, row, progress);
    await applyCommandBoundary(tx, character.id, ctx.now);
    await recordCommand(tx, {
      characterId: character.id,
      regionId: input.regionId,
      runId: current.runId,
      command: 'settings',
      atEncounter: (await tx.huntSession.findUniqueOrThrow({ where: { id: current.id } }))
        .encountersResolved,
      from: snapshot(before),
      to: snapshot(progress),
      ctx,
    });
    return { changed: true, settle };
  }

  // Estado de onde o jogador está saindo (pode ser outra região) — para a auditoria.
  const leaving =
    current && current.regionId !== input.regionId
      ? await tx.regionProgress.findUnique({
          where: {
            characterId_regionId: { characterId: character.id, regionId: current.regionId },
          },
        })
      : null;
  const fromState = current
    ? {
        status: current.status,
        regionId: current.regionId,
        ...(current.regionId === input.regionId
          ? snapshot(before)
          : leaving
            ? snapshot(toWaveProgress(leaving))
            : {}),
      }
    : null;
  if (settingsChanged) await saveProgress(tx, row, progress);
  const run = {
    runId: randomUUID(),
    seed: BigInt(randomSeed()),
    regionId: input.regionId,
    rulesetVersion: RULESET_VERSION,
    status: 'ACTIVE' as const,
    startedAt: ctx.now,
    lastSettledAt: ctx.now,
    encountersResolved: 0,
  };
  if (current) {
    await tx.huntSession.update({
      where: { id: current.id },
      data: { ...run, version: { increment: 1 } },
    });
  } else {
    await tx.huntSession.create({ data: { characterId: character.id, ...run } });
  }
  await recordCommand(tx, {
    characterId: character.id,
    regionId: input.regionId,
    runId: run.runId,
    command: 'start',
    atEncounter: 0,
    from: fromState,
    to: { status: 'ACTIVE', regionId: input.regionId, ...snapshot(progress) },
    ctx,
  });
  return { changed: true, settle };
}

export interface SettingsInput extends WaveSettings {
  regionId: string;
}

/**
 * Troca de modo e/ou wave. Se a caçada estiver ativa na região, liquida até agora e aplica
 * a fronteira de comando; caso contrário só grava a preferência para a próxima caçada.
 */
export async function changeHuntSettings(
  tx: Tx,
  character: Character,
  input: SettingsInput,
  config: AppConfig,
  ctx: CommandContext,
): Promise<{ changed: boolean; settle: SettleOutcome | null }> {
  regionOrThrow(input.regionId);
  const settle = await settleActiveHunt(tx, character, config, ctx.now);
  const fresh = await tx.character.findUniqueOrThrow({ where: { id: character.id } });
  assertRegionUnlocked(input.regionId, fresh.level);

  const row = await getOrCreateProgress(tx, character.id, input.regionId);
  const before = toWaveProgress(row);
  const { progress, changed } = settingsOrThrow(
    input.regionId,
    before,
    { ...(input.mode ? { mode: input.mode } : {}), ...(input.wave ? { wave: input.wave } : {}) },
    fresh.level,
  );
  if (!changed) return { changed: false, settle };

  await saveProgress(tx, row, progress);
  const hunt = await tx.huntSession.findUnique({ where: { characterId: character.id } });
  const active = hunt?.status === 'ACTIVE' && hunt.regionId === input.regionId;
  if (active) await applyCommandBoundary(tx, character.id, ctx.now);
  await recordCommand(tx, {
    characterId: character.id,
    regionId: input.regionId,
    runId: active ? hunt.runId : null,
    command: 'settings',
    atEncounter: active ? hunt.encountersResolved : null,
    from: snapshot(before),
    to: snapshot(progress),
    ctx,
  });
  return { changed: true, settle };
}

export async function stopHunt(
  tx: Tx,
  character: Character,
  config: AppConfig,
  ctx: CommandContext,
): Promise<{ changed: boolean; settle: SettleOutcome | null }> {
  const settle = await settleActiveHunt(tx, character, config, ctx.now);
  const hunt = await tx.huntSession.findUnique({ where: { characterId: character.id } });
  const updated = await tx.huntSession.updateMany({
    where: { characterId: character.id, status: 'ACTIVE' },
    data: { status: 'STOPPED', version: { increment: 1 } },
  });
  if (updated.count > 0 && hunt) {
    await recordCommand(tx, {
      characterId: character.id,
      regionId: hunt.regionId,
      runId: hunt.runId,
      command: 'stop',
      atEncounter: settle?.settlement.toEncounter ?? hunt.encountersResolved,
      from: { status: 'ACTIVE' },
      to: { status: 'STOPPED' },
      ctx,
    });
  }
  return { changed: updated.count > 0, settle };
}

/**
 * Encontros mais recentes da caçada atual, montados a partir dos resumos persistidos.
 * Os que acabaram de ser liquidados nesta requisição trazem os golpes individuais.
 */
export async function recentEncounters(
  db: PrismaClient | Tx,
  characterId: string,
  fresh: EncounterView[] = [],
): Promise<EncounterView[]> {
  const hunt = await db.huntSession.findUnique({
    where: { characterId },
    select: { runId: true },
  });
  if (!hunt) return [];
  const rows = await db.huntSettlement.findMany({
    where: { characterId, runId: hunt.runId },
    orderBy: { fromEncounter: 'desc' },
    take: RECENT_ENCOUNTERS_IN_RESPONSE,
    select: { recent: true },
  });
  const byIndex = new Map<number, EncounterView>();
  for (const row of rows.reverse()) {
    for (const e of row.recent as unknown as EncounterView[]) byIndex.set(e.index, e);
  }
  for (const e of fresh) if (e.runId === hunt.runId) byIndex.set(e.index, e);
  return [...byIndex.values()]
    .sort((a, b) => a.index - b.index)
    .slice(-RECENT_ENCOUNTERS_IN_RESPONSE);
}

export async function settlementHistory(
  db: PrismaClient,
  characterId: string,
  take = 10,
): Promise<Array<SettlementView & { regionId: string }>> {
  const rows = await db.huntSettlement.findMany({
    where: { characterId },
    orderBy: { id: 'desc' },
    take,
  });
  return rows.map((r) => ({ ...settlementView(r), regionId: r.regionId }));
}

export async function waveClearHistory(
  db: PrismaClient | Tx,
  characterId: string,
  take = 15,
): Promise<WaveClearView[]> {
  const rows = await db.waveClear.findMany({
    where: { characterId },
    orderBy: { id: 'desc' },
    take,
  });
  return rows.map(waveClearView);
}

export type { EncounterSummary };
