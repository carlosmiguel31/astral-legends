import {
  ITEMS,
  MONSTERS,
  RARITY_INFO,
  canEquip,
  type ClassId,
  type EncounterSummary,
  type EquippedItem,
  type ItemBonuses,
} from '@astral/game-core';
import type { EncounterView, ItemView, SettlementView } from '@astral/shared';
import type { ItemInstance } from '../../generated/prisma/client.js';

/** Bônus persistidos são JSON: só aceitamos inteiros não negativos nas chaves conhecidas. */
export function parseBonuses(raw: unknown): ItemBonuses {
  const result: ItemBonuses = {};
  if (typeof raw !== 'object' || raw === null) return result;
  const pick = <K extends string>(source: unknown, keys: readonly K[]) => {
    const out: Partial<Record<K, number>> = {};
    if (typeof source !== 'object' || source === null) return out;
    for (const key of keys) {
      const value = (source as Record<string, unknown>)[key];
      if (Number.isSafeInteger(value) && (value as number) >= 0) out[key] = value as number;
    }
    return out;
  };
  const r = raw as Record<string, unknown>;
  const attributes = pick(r.attributes, ['str', 'int', 'agi', 'vit'] as const);
  const stats = pick(r.stats, ['maxHp', 'attack', 'defense', 'critChanceBp'] as const);
  if (Object.keys(attributes).length > 0) result.attributes = attributes;
  if (Object.keys(stats).length > 0) result.stats = stats;
  return result;
}

export function itemDefOrThrow(defId: string) {
  const def = ITEMS[defId];
  if (!def) throw new Error(`definição de item desconhecida: ${defId}`);
  return def;
}

export function toEquipped(
  item: Pick<ItemInstance, 'defId' | 'rarity' | 'upgradeLevel' | 'bonuses'>,
): EquippedItem {
  return {
    slot: itemDefOrThrow(item.defId).slot,
    rarity: item.rarity,
    upgradeLevel: item.upgradeLevel,
    bonuses: parseBonuses(item.bonuses),
  };
}

export function itemView(item: ItemInstance, classId: ClassId, level: number): ItemView {
  const def = itemDefOrThrow(item.defId);
  const usability = canEquip(def, classId, level);
  return {
    id: item.id,
    defId: item.defId,
    name: def.name,
    description: def.description,
    slot: def.slot,
    rarity: item.rarity,
    rarityName: RARITY_INFO[item.rarity].name,
    upgradeLevel: item.upgradeLevel,
    bonuses: parseBonuses(item.bonuses),
    minLevel: def.minLevel,
    classes: def.classes ? [...def.classes] : null,
    equipped: item.equippedSlot !== null,
    usable: usability.usable,
    unusableReason: usability.reason,
    obtainedAt: item.createdAt.toISOString(),
  };
}

/** Resumo persistido no histórico (sem golpes individuais, exceto os mais recentes). */
export type StoredEncounter = EncounterView;

export function encounterView(
  summary: EncounterSummary,
  runId: string,
  keptDrops: ReadonlySet<number>,
): EncounterView {
  const monster = MONSTERS[summary.monsterId];
  const drop = summary.drop
    ? {
        defId: summary.drop.defId,
        name: itemDefOrThrow(summary.drop.defId).name,
        rarity: summary.drop.rarity,
        kept: keptDrops.has(summary.index),
      }
    : null;
  return {
    runId,
    index: summary.index,
    monsterId: summary.monsterId,
    monsterName: monster?.name ?? summary.monsterId,
    monsterLevel: summary.monsterLevel,
    outcome: summary.outcome,
    startedAt: summary.startedAtMs,
    combatStartAt: summary.combatStartMs,
    combatMs: summary.combatMs,
    endedAt: summary.endedAtMs,
    playerMaxHp: summary.playerMaxHp,
    monsterMaxHp: summary.monsterMaxHp,
    damageDealt: summary.damageDealt,
    damageTaken: summary.damageTaken,
    xp: summary.xp,
    gold: summary.gold,
    essence: summary.essence,
    drop,
    levelBefore: summary.levelBefore,
    levelAfter: summary.levelAfter,
    levelUp: summary.levelUp,
    wave: summary.wave,
    mode: summary.mode,
    position: summary.position,
    kind: summary.kind,
    waveWinsAfter: summary.waveWinsAfter,
    waveCleared: summary.waveCleared,
    firstClear: summary.firstClear,
    ...(summary.events ? { events: summary.events } : {}),
  };
}

export function settlementView(row: {
  fromEncounter: number;
  toEncounter: number;
  wins: number;
  losses: number;
  timeouts: number;
  xpGained: number;
  gold: bigint;
  essence: bigint;
  itemsDropped: number;
  itemsDiscarded: number;
  levelBefore: number;
  levelAfter: number;
  forfeitedMs: bigint;
  windowStart: Date;
  windowEnd: Date;
  createdAt: Date;
  waveBefore: number | null;
  waveAfter: number | null;
  modeAfter: 'ADVANCE' | 'FARM' | null;
  wavesCleared: number;
  firstClears: number;
  firstClearGold: bigint;
  firstClearEssence: bigint;
}): SettlementView {
  return {
    fromEncounter: row.fromEncounter,
    toEncounter: row.toEncounter,
    encounters: row.toEncounter - row.fromEncounter,
    wins: row.wins,
    losses: row.losses,
    timeouts: row.timeouts,
    xpGained: row.xpGained,
    gold: row.gold.toString(),
    essence: row.essence.toString(),
    itemsDropped: row.itemsDropped,
    itemsDiscarded: row.itemsDiscarded,
    levelBefore: row.levelBefore,
    levelAfter: row.levelAfter,
    forfeitedMs: Number(row.forfeitedMs),
    windowStart: row.windowStart.toISOString(),
    windowEnd: row.windowEnd.toISOString(),
    createdAt: row.createdAt.toISOString(),
    waveBefore: row.waveBefore,
    waveAfter: row.waveAfter,
    modeAfter: row.modeAfter === null ? null : row.modeAfter === 'ADVANCE' ? 'advance' : 'farm',
    wavesCleared: row.wavesCleared,
    firstClears: row.firstClears,
    firstClearGold: row.firstClearGold.toString(),
    firstClearEssence: row.firstClearEssence.toString(),
  };
}
