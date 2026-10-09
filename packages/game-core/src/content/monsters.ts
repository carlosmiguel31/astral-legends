import type { AffinityId, CombatStats } from '../types.js';

export interface MonsterDefinition {
  id: string;
  name: string;
  description: string;
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
    /** Chance (bp) de deixar cair um item da tabela da região. */
    itemDropChanceBp: number;
  };
}

const NO_PASSIVES = { armorPenBp: 0, damageReductionBp: 0 } as const;

type MonsterInput = Omit<MonsterDefinition, 'stats' | 'isBoss'> & {
  isBoss?: boolean;
  stats: Omit<CombatStats, 'armorPenBp' | 'damageReductionBp'> &
    Partial<Pick<CombatStats, 'armorPenBp' | 'damageReductionBp'>>;
};

function monster(input: MonsterInput): MonsterDefinition {
  return {
    ...input,
    isBoss: input.isBoss ?? false,
    stats: { ...NO_PASSIVES, ...input.stats },
  };
}

const LIST: MonsterDefinition[] = [
  // ── Campos do Alvorecer (1–6) ──────────────────────────────────────────────
  monster({
    id: 'brotolume',
    name: 'Brotolume',
    description: 'Broto que absorveu poeira estelar e brilha ao amanhecer.',
    level: 1,
    affinity: 'solar',
    stats: {
      maxHp: 60,
      attack: 9,
      defense: 4,
      critChanceBp: 300,
      critPowerBp: 15_000,
      attackIntervalMs: 1_800,
    },
    rewards: { xp: 8, goldMin: 3, goldMax: 6, essenceChanceBp: 200, itemDropChanceBp: 150 },
  }),
  monster({
    id: 'lobo-cometa',
    name: 'Lobo-Cometa',
    description: 'Caçador veloz que deixa um rastro de faíscas ao correr.',
    level: 3,
    affinity: 'storm',
    stats: {
      maxHp: 110,
      attack: 15,
      defense: 8,
      critChanceBp: 800,
      critPowerBp: 15_000,
      attackIntervalMs: 1_300,
    },
    rewards: { xp: 18, goldMin: 6, goldMax: 12, essenceChanceBp: 400, itemDropChanceBp: 200 },
  }),
  monster({
    id: 'vigia-de-quartzo',
    name: 'Vigia de Quartzo',
    description: 'Sentinela de cristal que reflete o luar e resiste a golpes fracos.',
    level: 5,
    affinity: 'lunar',
    stats: {
      maxHp: 200,
      attack: 20,
      defense: 20,
      critChanceBp: 300,
      critPowerBp: 15_000,
      attackIntervalMs: 2_000,
    },
    rewards: { xp: 40, goldMin: 10, goldMax: 20, essenceChanceBp: 700, itemDropChanceBp: 250 },
  }),
  monster({
    id: 'colosso-do-eclipse-menor',
    name: 'Colosso do Eclipse Menor',
    description: 'Gigante de pedra rachada por onde escorre a escuridão do Vazio.',
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
    },
    rewards: { xp: 400, goldMin: 80, goldMax: 150, essenceChanceBp: 10_000, itemDropChanceBp: 10_000 },
  }),

  // ── Bosque das Marés de Prata (6–12) ───────────────────────────────────────
  monster({
    id: 'lince-de-mare',
    name: 'Lince-de-Maré',
    description: 'Felino de pelagem prateada que caça entre as raízes alagadas.',
    level: 7,
    affinity: 'lunar',
    stats: {
      maxHp: 220,
      attack: 26,
      defense: 14,
      critChanceBp: 900,
      critPowerBp: 15_000,
      attackIntervalMs: 1_300,
    },
    rewards: { xp: 70, goldMin: 14, goldMax: 24, essenceChanceBp: 500, itemDropChanceBp: 300 },
  }),
  monster({
    id: 'agua-viva-prateada',
    name: 'Água-Viva Prateada',
    description: 'Flutua sobre a névoa do bosque; seu toque gela como a luz da lua.',
    level: 9,
    affinity: 'lunar',
    stats: {
      maxHp: 300,
      attack: 30,
      defense: 18,
      critChanceBp: 400,
      critPowerBp: 16_000,
      attackIntervalMs: 1_600,
    },
    rewards: { xp: 105, goldMin: 18, goldMax: 30, essenceChanceBp: 600, itemDropChanceBp: 350 },
  }),
  monster({
    id: 'raiz-sussurrante',
    name: 'Raiz Sussurrante',
    description: 'Árvore corrompida pelo Vazio que murmura nomes esquecidos.',
    level: 11,
    affinity: 'abyssal',
    stats: {
      maxHp: 420,
      attack: 36,
      defense: 26,
      critChanceBp: 300,
      critPowerBp: 15_000,
      attackIntervalMs: 2_000,
    },
    rewards: { xp: 150, goldMin: 24, goldMax: 40, essenceChanceBp: 800, itemDropChanceBp: 400 },
  }),

  // ── Desfiladeiro dos Trovões (12–20) ───────────────────────────────────────
  monster({
    id: 'grifo-de-faisca',
    name: 'Grifo-de-Faísca',
    description: 'Ave-leão que mergulha das nuvens carregadas de relâmpagos.',
    level: 13,
    affinity: 'storm',
    stats: {
      maxHp: 480,
      attack: 44,
      defense: 26,
      critChanceBp: 1_000,
      critPowerBp: 15_000,
      attackIntervalMs: 1_400,
    },
    rewards: { xp: 210, goldMin: 30, goldMax: 50, essenceChanceBp: 700, itemDropChanceBp: 400 },
  }),
  monster({
    id: 'golem-de-basalto',
    name: 'Golem de Basalto',
    description: 'Rocha vulcânica animada pelo calor de um astro caído.',
    level: 16,
    affinity: 'solar',
    stats: {
      maxHp: 760,
      attack: 52,
      defense: 46,
      critChanceBp: 300,
      critPowerBp: 15_000,
      attackIntervalMs: 2_200,
    },
    rewards: { xp: 300, goldMin: 40, goldMax: 64, essenceChanceBp: 900, itemDropChanceBp: 450 },
  }),
  monster({
    id: 'serpente-de-relampago',
    name: 'Serpente de Relâmpago',
    description: 'Corre pelas fendas do desfiladeiro mais rápido que o trovão.',
    level: 19,
    affinity: 'storm',
    stats: {
      maxHp: 700,
      attack: 62,
      defense: 36,
      critChanceBp: 1_200,
      critPowerBp: 16_000,
      attackIntervalMs: 1_300,
    },
    rewards: { xp: 380, goldMin: 50, goldMax: 80, essenceChanceBp: 1_000, itemDropChanceBp: 500 },
  }),
];

export const MONSTERS: Readonly<Record<string, MonsterDefinition>> = Object.fromEntries(
  LIST.map((m) => [m.id, m]),
);
