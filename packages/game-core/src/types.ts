/** Identificadores estáveis. Nunca renomeie um valor já persistido no banco. */

export const CLASS_IDS = ['guardian', 'arcanist', 'blade'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

export const AFFINITY_IDS = ['solar', 'lunar', 'storm', 'abyssal'] as const;
export type AffinityId = (typeof AFFINITY_IDS)[number];

export const EQUIP_SLOTS = ['weapon', 'head', 'chest', 'hands', 'legs', 'feet'] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'astral'] as const;
export type Rarity = (typeof RARITIES)[number];

export const CURRENCIES = ['GOLD', 'ESSENCE', 'DIAMOND'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Atributos primários. Crescem por nível e são ampliados por equipamentos. */
export interface Attributes {
  /** Força: ataque de classes marciais e parte da defesa. */
  str: number;
  /** Intelecto: ataque de classes arcanas. */
  int: number;
  /** Agilidade: chance crítica e velocidade de ataque. */
  agi: number;
  /** Vitalidade: vida máxima e defesa. */
  vit: number;
}

/** Estatísticas de combate já derivadas. Todos os valores são inteiros. */
export interface CombatStats {
  maxHp: number;
  attack: number;
  defense: number;
  /** Chance de crítico em bp (0–10_000). */
  critChanceBp: number;
  /** Multiplicador do dano crítico em bp (15_000 = 150%). */
  critPowerBp: number;
  /** Intervalo entre ataques, em milissegundos de tempo de jogo. */
  attackIntervalMs: number;
  /** Fração da defesa do alvo ignorada, em bp. */
  armorPenBp: number;
  /** Redução de dano recebido, em bp. */
  damageReductionBp: number;
}

export type StatKey = keyof CombatStats;
