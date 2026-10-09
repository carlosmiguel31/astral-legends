import type { AffinityId, CombatStats } from '../types.js';

export interface MonsterDefinition {
  id: string;
  name: string;
  level: number;
  affinity: AffinityId;
  isBoss: boolean;
  stats: CombatStats;
  rewards: {
    xp: number;
    goldMin: number;
    goldMax: number;
    /** Chance (bp) de conceder 1 essência astral. */
    essenceChanceBp: number;
  };
}

const NO_PASSIVES = { armorPenBp: 0, damageReductionBp: 0 } as const;

export const MONSTERS: Readonly<Record<string, MonsterDefinition>> = {
  brotolume: {
    id: 'brotolume',
    name: 'Brotolume',
    level: 1,
    affinity: 'solar',
    isBoss: false,
    stats: {
      maxHp: 60,
      attack: 9,
      defense: 4,
      critChanceBp: 300,
      critPowerBp: 15_000,
      attackIntervalMs: 1_800,
      ...NO_PASSIVES,
    },
    rewards: { xp: 12, goldMin: 3, goldMax: 6, essenceChanceBp: 200 },
  },
  'lobo-cometa': {
    id: 'lobo-cometa',
    name: 'Lobo-Cometa',
    level: 3,
    affinity: 'storm',
    isBoss: false,
    stats: {
      maxHp: 110,
      attack: 15,
      defense: 8,
      critChanceBp: 800,
      critPowerBp: 15_000,
      attackIntervalMs: 1_300,
      ...NO_PASSIVES,
    },
    rewards: { xp: 30, goldMin: 6, goldMax: 12, essenceChanceBp: 400 },
  },
  'vigia-de-quartzo': {
    id: 'vigia-de-quartzo',
    name: 'Vigia de Quartzo',
    level: 5,
    affinity: 'lunar',
    isBoss: false,
    stats: {
      maxHp: 200,
      attack: 20,
      defense: 20,
      critChanceBp: 300,
      critPowerBp: 15_000,
      attackIntervalMs: 2_000,
      ...NO_PASSIVES,
    },
    rewards: { xp: 60, goldMin: 10, goldMax: 20, essenceChanceBp: 700 },
  },
  'colosso-do-eclipse-menor': {
    id: 'colosso-do-eclipse-menor',
    name: 'Colosso do Eclipse Menor',
    level: 6,
    affinity: 'abyssal',
    isBoss: true,
    stats: {
      maxHp: 900,
      attack: 30,
      defense: 25,
      critChanceBp: 500,
      critPowerBp: 18_000,
      attackIntervalMs: 2_200,
      ...NO_PASSIVES,
    },
    rewards: { xp: 400, goldMin: 80, goldMax: 150, essenceChanceBp: 10_000 },
  },
};
