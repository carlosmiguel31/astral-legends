import { ITEMS, RARITY_INFO, type Range } from './content/items.js';
import { applyBp } from './imath.js';
import type { Rng } from './rng.js';
import type { ItemBonuses } from './stats.js';
import type { Rarity } from './types.js';

/** Chances de raridade de um drop (bp, acumuladas na ordem épica → rara → comum). */
export const RARITY_ROLL_BP = { epic: 300, rare: 1_700 } as const;

const ATTRIBUTE_ORDER = ['str', 'int', 'agi', 'vit'] as const;
const STAT_ORDER = ['maxHp', 'attack', 'defense', 'critChanceBp'] as const;

export interface ItemDrop {
  /** Encontro que gerou o drop (identidade estável para idempotência). */
  encounterIndex: number;
  defId: string;
  rarity: Rarity;
  bonuses: ItemBonuses;
}

/** Sorteio ponderado. Consome exatamente um valor do RNG. */
export function pickWeighted<T extends { weight: number }>(entries: readonly T[], rng: Rng): T {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  if (total <= 0) throw new Error('tabela de pesos vazia');
  let roll = rng.int(0, total - 1);
  for (const entry of entries) {
    if (roll < entry.weight) return entry;
    roll -= entry.weight;
  }
  throw new Error('inalcançável: sorteio ponderado fora da tabela');
}

/** Raridade de um drop. Consome exatamente um valor do RNG. */
export function rollRarity(rng: Rng): Rarity {
  const roll = rng.int(0, 9_999);
  if (roll < RARITY_ROLL_BP.epic) return 'epic';
  if (roll < RARITY_ROLL_BP.epic + RARITY_ROLL_BP.rare) return 'rare';
  return 'common';
}

function rollRange(range: Range, multiplierBp: number, rng: Rng): number {
  return applyBp(rng.int(range[0], range[1]), multiplierBp);
}

/**
 * Sorteia os bônus de um item. Ordem fixa de consumo do RNG: atributos
 * (str, int, agi, vit) e depois estatísticas (maxHp, attack, defense, critChanceBp),
 * apenas para as faixas definidas no item. Bônus que resultam em zero são omitidos.
 */
export function rollItemBonuses(defId: string, rarity: Rarity, rng: Rng): ItemBonuses {
  const def = ITEMS[defId];
  if (!def) throw new Error(`item inexistente: ${defId}`);
  const mult = RARITY_INFO[rarity].multiplierBp;
  const result: ItemBonuses = {};

  const attrs: NonNullable<ItemBonuses['attributes']> = {};
  for (const key of ATTRIBUTE_ORDER) {
    const range = def.bonusRanges.attributes?.[key];
    if (!range) continue;
    const value = rollRange(range, mult, rng);
    if (value > 0) attrs[key] = value;
  }
  if (Object.keys(attrs).length > 0) result.attributes = attrs;

  const stats: NonNullable<ItemBonuses['stats']> = {};
  for (const key of STAT_ORDER) {
    const range = def.bonusRanges.stats?.[key];
    if (!range) continue;
    const value = rollRange(range, mult, rng);
    if (value > 0) stats[key] = value;
  }
  if (Object.keys(stats).length > 0) result.stats = stats;

  return result;
}
