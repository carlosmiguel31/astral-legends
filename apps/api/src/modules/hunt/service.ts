import { randomUUID } from 'node:crypto';
import {
  REGIONS,
  RULESET_VERSION,
  isRegionUnlocked,
  settleHunt,
  type EncounterSummary,
} from '@astral/game-core';
import type { EncounterView, SettlementView } from '@astral/shared';
import type { AppConfig } from '../../config/env.js';
import { AppError, notFound } from '../../http/errors.js';
import type { Character, Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { HuntSettlement } from '../../generated/prisma/client.js';
import { randomSeed } from '../../lib/crypto.js';
import { applyLedgerEntryInTx } from '../economy/ledger.js';
import { encounterView, settlementView, toEquipped } from '../game/views.js';

type Tx = Prisma.TransactionClient;

/** Quantos encontros recentes acompanham cada resposta (histórico e animação). */
export const RECENT_ENCOUNTERS_IN_RESPONSE = 20;
/** Golpes individuais são enviados para os últimos encontros liquidados na própria requisição. */
const EVENTS_FOR_LAST = 3;

export interface SettleOutcome {
  settlement: HuntSettlement;
  /** Encontros desta liquidação, com golpes nos mais recentes (não persistidos). */
  encounters: EncounterView[];
}

export class HuntConflictError extends AppError {
  constructor() {
    super(409, 'HUNT_CONFLICT', 'A caçada foi atualizada por outra requisição; tente novamente');
  }
}

/**
 * Liquida a caçada ativa até `now`, dentro de uma transação que já travou o personagem.
 * Atualiza nível/XP, cria itens, credita moedas no livro-razão e registra o resumo.
 * Proteções contra duplicação (cada uma suficiente por si):
 *   1. trava do personagem (serializa liquidações da mesma conta);
 *   2. `version` condicional em `hunt_sessions`;
 *   3. chaves de idempotência do livro-razão por intervalo de encontros;
 *   4. `hunt_settlements (run_id, from_encounter)` e `item_instances.source_ref` únicos.
 */
export async function settleActiveHunt(
  tx: Tx,
  character: Character,
  config: AppConfig,
  now: Date,
): Promise<SettleOutcome | null> {
  const hunt = await tx.huntSession.findUnique({ where: { characterId: character.id } });
  if (!hunt || hunt.status !== 'ACTIVE') return null;

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

  // Inventário cheio: os itens excedentes são descartados (e contabilizados no resumo).
  const unequipped = await tx.itemInstance.count({
    where: { ownerCharacterId: character.id, equippedSlot: null },
  });
  const free = Math.max(0, config.INVENTORY_CAPACITY - unequipped);
  const kept = result.drops.slice(0, free);
  const keptIndexes = new Set(kept.map((d) => d.encounterIndex));
  if (kept.length > 0) {
    await tx.itemInstance.createMany({
      data: kept.map((drop) => ({
        ownerCharacterId: character.id,
        defId: drop.defId,
        rarity: drop.rarity,
        bonuses: drop.bonuses as Prisma.InputJsonObject,
        rulesetVersion: RULESET_VERSION,
        source: 'DROP' as const,
        sourceRef: `hunt:${hunt.runId}:enc:${drop.encounterIndex}`,
      })),
    });
  }

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

  const charUpdate = await tx.character.updateMany({
    where: { id: character.id, version: character.version },
    data: { level: result.level, xp: result.xp, version: { increment: 1 } },
  });
  if (charUpdate.count !== 1) throw new HuntConflictError();

  await updateHuntCursor(tx, hunt.id, hunt.version, {
    lastSettledAt: new Date(result.windowEndMs),
    encountersResolved: result.nextEncounter,
  });

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
    },
  });
  return { settlement, encounters: views };
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

/** Inicia (ou troca a região de) uma caçada. Idempotente para a mesma região. */
export async function startHunt(
  tx: Tx,
  character: Character,
  regionId: string,
  config: AppConfig,
  now: Date,
): Promise<{ changed: boolean; settle: SettleOutcome | null }> {
  const region = REGIONS[regionId];
  if (!region) throw notFound('REGION_NOT_FOUND', 'Região não encontrada');

  // Liquida a caçada anterior primeiro: o progresso até agora é preservado.
  const settle = await settleActiveHunt(tx, character, config, now);
  const fresh = await tx.character.findUniqueOrThrow({ where: { id: character.id } });
  if (!isRegionUnlocked(region, fresh.level)) {
    throw new AppError(
      403,
      'REGION_LOCKED',
      `${region.name} é liberada a partir do nível ${region.minLevel}`,
    );
  }

  const current = await tx.huntSession.findUnique({ where: { characterId: character.id } });
  if (current?.status === 'ACTIVE' && current.regionId === regionId)
    return { changed: false, settle };

  const run = {
    runId: randomUUID(),
    seed: BigInt(randomSeed()),
    regionId,
    rulesetVersion: RULESET_VERSION,
    status: 'ACTIVE' as const,
    startedAt: now,
    lastSettledAt: now,
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
  return { changed: true, settle };
}

export async function stopHunt(
  tx: Tx,
  character: Character,
  config: AppConfig,
  now: Date,
): Promise<{ changed: boolean; settle: SettleOutcome | null }> {
  const settle = await settleActiveHunt(tx, character, config, now);
  const updated = await tx.huntSession.updateMany({
    where: { characterId: character.id, status: 'ACTIVE' },
    data: { status: 'STOPPED', version: { increment: 1 } },
  });
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

export type { EncounterSummary };
