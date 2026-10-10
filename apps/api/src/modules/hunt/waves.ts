import {
  ITEMS,
  REGIONS,
  REGION_ORDER,
  WAVE_RULES,
  encounterKind,
  initialWaveProgress,
  maxSelectableWave,
  unlockedWave,
  waveCount,
  waveKind,
  type HuntMode,
  type WaveNotice,
  type WaveProgress,
} from '@astral/game-core';
import { waveNoticeSchema, type RegionProgressView, type WaveClearView } from '@astral/shared';
import {
  Prisma,
  type HuntMode as DbHuntMode,
  type PrismaClient,
  type RegionProgress,
  type WaveClear,
} from '../../generated/prisma/client.js';
import { AppError } from '../../http/errors.js';

type Db = PrismaClient | Prisma.TransactionClient;

export const toDbMode = (mode: HuntMode): DbHuntMode => (mode === 'advance' ? 'ADVANCE' : 'FARM');
export const fromDbMode = (mode: DbHuntMode): HuntMode => (mode === 'ADVANCE' ? 'advance' : 'farm');

function parseNotice(raw: unknown): WaveNotice | null {
  if (raw === null || raw === undefined) return null;
  const parsed = waveNoticeSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function safeInt(value: bigint, label: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`${label} fora do intervalo seguro`);
  return n;
}

/**
 * Converte a linha do banco no estado usado pelo motor. Se uma atualização de conteúdo
 * reduzir as waves de uma região, a wave salva é trazida para a última existente (com a
 * contagem zerada) em vez de travar a liquidação.
 */
export function toWaveProgress(row: RegionProgress): WaveProgress {
  const region = REGIONS[row.regionId];
  const count = region ? waveCount(region) : row.wave;
  if (row.wave > count || row.highestCleared > count) {
    return initialWaveProgress(
      fromDbMode(row.mode),
      Math.min(row.wave, count),
      Math.min(row.highestCleared, count),
    );
  }
  return {
    mode: fromDbMode(row.mode),
    wave: row.wave,
    wins: row.waveWins,
    losses: row.waveLosses,
    failStreak: row.failStreak,
    xp: row.waveXp,
    gold: safeInt(row.waveGold, 'wave_gold'),
    essence: safeInt(row.waveEssence, 'wave_essence'),
    items: row.waveItems,
    highestCleared: row.highestCleared,
    notice: parseNotice(row.notice),
  };
}

/** Campos a gravar a partir do estado do motor. */
export function progressData(p: WaveProgress) {
  return {
    mode: toDbMode(p.mode),
    wave: p.wave,
    waveWins: p.wins,
    waveLosses: p.losses,
    failStreak: p.failStreak,
    waveXp: p.xp,
    waveGold: BigInt(p.gold),
    waveEssence: BigInt(p.essence),
    waveItems: p.items,
    highestCleared: p.highestCleared,
    notice: p.notice === null ? Prisma.DbNull : (p.notice as Prisma.InputJsonObject),
  };
}

export class WaveConflictError extends AppError {
  constructor() {
    super(409, 'WAVE_CONFLICT', 'O progresso da wave foi atualizado por outra requisição');
  }
}

/** Lê o progresso da região; cria com os padrões informados se ainda não existir. */
export async function getOrCreateProgress(
  tx: Prisma.TransactionClient,
  characterId: string,
  regionId: string,
  defaults: WaveProgress = initialWaveProgress('advance', 1, 0),
): Promise<RegionProgress> {
  const existing = await tx.regionProgress.findUnique({
    where: { characterId_regionId: { characterId, regionId } },
  });
  if (existing) return existing;
  return tx.regionProgress.create({
    data: { characterId, regionId, ...progressData(defaults) },
  });
}

/** Grava o novo estado com controle de concorrência otimista. */
export async function saveProgress(
  tx: Prisma.TransactionClient,
  row: RegionProgress,
  progress: WaveProgress,
  extra: { totalClearsIncrement?: number } = {},
): Promise<void> {
  const updated = await tx.regionProgress.updateMany({
    where: { characterId: row.characterId, regionId: row.regionId, version: row.version },
    data: {
      ...progressData(progress),
      ...(extra.totalClearsIncrement
        ? { totalClears: { increment: extra.totalClearsIncrement } }
        : {}),
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) throw new WaveConflictError();
}

function view(
  regionId: string,
  progress: WaveProgress,
  totalClears: number,
  level: number,
): RegionProgressView {
  const region = REGIONS[regionId]!;
  return {
    regionId,
    mode: progress.mode,
    wave: progress.wave,
    waveKind: waveKind(progress.wave),
    nextEncounterKind: encounterKind(progress.wave, progress.wins),
    waveWins: progress.wins,
    waveLosses: progress.losses,
    failStreak: progress.failStreak,
    totals: {
      xp: progress.xp,
      gold: String(progress.gold),
      essence: String(progress.essence),
      items: progress.items,
    },
    highestCleared: progress.highestCleared,
    unlockedWave: unlockedWave(region, progress.highestCleared),
    maxSelectableWave: maxSelectableWave(region, progress.highestCleared, level),
    waveCount: waveCount(region),
    totalClears,
    notice: progress.notice,
  };
}

/** Progresso de todas as regiões, na ordem de progressão (padrões para as não visitadas). */
export async function regionProgressViews(
  db: Db,
  characterId: string,
  level: number,
): Promise<RegionProgressView[]> {
  const rows = await db.regionProgress.findMany({ where: { characterId } });
  const byRegion = new Map(rows.map((r) => [r.regionId, r]));
  return REGION_ORDER.map((regionId) => {
    const row = byRegion.get(regionId);
    return row
      ? view(regionId, toWaveProgress(row), row.totalClears, level)
      : view(regionId, initialWaveProgress('advance', 1, 0), 0, level);
  });
}

export function waveClearView(row: WaveClear): WaveClearView {
  const itemName = row.firstClearItemDef
    ? (ITEMS[row.firstClearItemDef]?.name ?? row.firstClearItemDef)
    : null;
  return {
    regionId: row.regionId,
    wave: row.wave,
    kind: row.kind as WaveClearView['kind'],
    mode: fromDbMode(row.mode),
    encounterIndex: row.encounterIndex,
    firstClear: row.firstClear,
    wins: row.wins,
    losses: row.losses,
    xp: row.xp,
    gold: row.gold.toString(),
    essence: row.essence.toString(),
    items: row.items,
    firstClearReward: row.firstClear
      ? {
          gold: row.firstClearGold.toString(),
          essence: row.firstClearEssence.toString(),
          item:
            row.firstClearItemDef && row.firstClearRarity && itemName
              ? { defId: row.firstClearItemDef, name: itemName, rarity: row.firstClearRarity }
              : null,
        }
      : null,
    next: {
      mode: fromDbMode(row.nextMode),
      wave: row.nextWave,
      reason: row.nextReason as WaveClearView['next']['reason'],
    },
    clearedAt: row.clearedAt.toISOString(),
  };
}

export { WAVE_RULES };
