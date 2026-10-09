import type { ClassId, EquipSlot, Rarity } from '../types.js';

/** Faixa [mín, máx] inteira sorteada na criação do item. */
export type Range = readonly [number, number];

export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  slot: EquipSlot;
  /** Nível mínimo para equipar. */
  minLevel: number;
  /** Classes que podem equipar; `null` = todas. */
  classes: readonly ClassId[] | null;
  /** Faixas de bônus antes do multiplicador de raridade. */
  bonusRanges: {
    attributes?: Partial<Record<'str' | 'int' | 'agi' | 'vit', Range>>;
    stats?: Partial<Record<'maxHp' | 'attack' | 'defense' | 'critChanceBp', Range>>;
  };
}

/** Raridades que podem cair na Fase 1. As demais existem no modelo para fases futuras. */
export const DROPPABLE_RARITIES = ['common', 'rare', 'epic'] as const satisfies readonly Rarity[];

export const RARITY_INFO: Readonly<Record<Rarity, { name: string; multiplierBp: number }>> = {
  common: { name: 'Comum', multiplierBp: 10_000 },
  uncommon: { name: 'Incomum', multiplierBp: 12_000 },
  rare: { name: 'Rara', multiplierBp: 14_000 },
  epic: { name: 'Épica', multiplierBp: 19_000 },
  legendary: { name: 'Lendária', multiplierBp: 25_000 },
  astral: { name: 'Astral', multiplierBp: 32_000 },
};

const MARTIAL: readonly ClassId[] = ['guardian', 'blade'];
const ARCANE: readonly ClassId[] = ['arcanist'];

const LIST: ItemDefinition[] = [
  // ── Equipamento inicial (concedido na criação do personagem) ────────────────
  {
    id: 'maca-do-juramento',
    name: 'Maça do Juramento',
    description: 'Arma cerimonial entregue a todo Guardião no dia do juramento.',
    slot: 'weapon',
    minLevel: 1,
    classes: ['guardian'],
    bonusRanges: { stats: { attack: [3, 3] }, attributes: { vit: [1, 1] } },
  },
  {
    id: 'cajado-do-aprendiz',
    name: 'Cajado do Aprendiz',
    description: 'Madeira de salgueiro com um fragmento de estrela preso à ponta.',
    slot: 'weapon',
    minLevel: 1,
    classes: ['arcanist'],
    bonusRanges: { stats: { attack: [4, 4] }, attributes: { int: [1, 1] } },
  },
  {
    id: 'adaga-do-cometa',
    name: 'Adaga do Cometa',
    description: 'Lâmina curta e leve, polida até refletir o céu noturno.',
    slot: 'weapon',
    minLevel: 1,
    classes: ['blade'],
    bonusRanges: { stats: { attack: [3, 3] }, attributes: { agi: [1, 1] } },
  },

  // ── Nível 1: Campos do Alvorecer ──────────────────────────────────────────
  {
    id: 'lamina-curta-de-quartzo',
    name: 'Lâmina Curta de Quartzo',
    description: 'Cristal lascado e afiado preso a um cabo de couro.',
    slot: 'weapon',
    minLevel: 1,
    classes: MARTIAL,
    bonusRanges: { stats: { attack: [3, 6] } },
  },
  {
    id: 'varinha-de-orvalho',
    name: 'Varinha de Orvalho',
    description: 'Condensa o orvalho da madrugada em pequenas lanças de luz.',
    slot: 'weapon',
    minLevel: 1,
    classes: ARCANE,
    bonusRanges: { stats: { attack: [3, 6] } },
  },
  {
    id: 'elmo-de-cobre-estelar',
    name: 'Elmo de Cobre Estelar',
    description: 'Forjado com cobre de meteoritos miúdos.',
    slot: 'head',
    minLevel: 1,
    classes: null,
    bonusRanges: { stats: { defense: [1, 3] }, attributes: { vit: [0, 1] } },
  },
  {
    id: 'peitoral-do-alvorecer',
    name: 'Peitoral do Alvorecer',
    description: 'Couro tingido com o laranja do primeiro sol.',
    slot: 'chest',
    minLevel: 1,
    classes: null,
    bonusRanges: { stats: { maxHp: [8, 16], defense: [1, 2] } },
  },
  {
    id: 'luvas-de-couro-de-cometa',
    name: 'Luvas de Couro de Cometa',
    description: 'Costuradas com fios que guardam um resto de velocidade.',
    slot: 'hands',
    minLevel: 1,
    classes: null,
    bonusRanges: { stats: { critChanceBp: [50, 120] } },
  },
  {
    id: 'perneiras-de-linho-astral',
    name: 'Perneiras de Linho Astral',
    description: 'Tecido leve que nunca se rasga nas trilhas.',
    slot: 'legs',
    minLevel: 1,
    classes: null,
    bonusRanges: { stats: { maxHp: [6, 12] } },
  },
  {
    id: 'botas-de-viajante',
    name: 'Botas de Viajante',
    description: 'Solas gastas por quem já cruzou muitas planícies.',
    slot: 'feet',
    minLevel: 1,
    classes: null,
    bonusRanges: { attributes: { agi: [1, 2] } },
  },

  // ── Nível 6: Bosque das Marés de Prata ────────────────────────────────────
  {
    id: 'sabre-de-mare',
    name: 'Sabre de Maré',
    description: 'O fio da lâmina ondula como água sob o luar.',
    slot: 'weapon',
    minLevel: 6,
    classes: MARTIAL,
    bonusRanges: { stats: { attack: [8, 12] }, attributes: { str: [0, 2] } },
  },
  {
    id: 'cetro-da-lua-crescente',
    name: 'Cetro da Lua Crescente',
    description: 'Prata trabalhada em forma de lua, fria ao toque.',
    slot: 'weapon',
    minLevel: 6,
    classes: ARCANE,
    bonusRanges: { stats: { attack: [8, 12] }, attributes: { int: [0, 2] } },
  },
  {
    id: 'elmo-de-mare',
    name: 'Elmo de Maré',
    description: 'Concha polida reforçada com aros de prata.',
    slot: 'head',
    minLevel: 6,
    classes: null,
    bonusRanges: { stats: { defense: [3, 6] }, attributes: { vit: [0, 2] } },
  },
  {
    id: 'manto-de-prata-lunar',
    name: 'Manto de Prata Lunar',
    description: 'Tecido que muda de tom conforme as fases da lua.',
    slot: 'chest',
    minLevel: 6,
    classes: null,
    bonusRanges: { stats: { maxHp: [20, 35], defense: [2, 4] } },
  },
  {
    id: 'luvas-de-escama',
    name: 'Luvas de Escama',
    description: 'Escamas de peixe-lua costuradas em couro macio.',
    slot: 'hands',
    minLevel: 6,
    classes: null,
    bonusRanges: { stats: { critChanceBp: [100, 200], attack: [1, 3] } },
  },
  {
    id: 'grevas-de-coral',
    name: 'Grevas de Coral',
    description: 'Coral prateado moldado para proteger as pernas.',
    slot: 'legs',
    minLevel: 6,
    classes: null,
    bonusRanges: { stats: { maxHp: [15, 25] }, attributes: { vit: [0, 1] } },
  },
  {
    id: 'sandalias-de-espuma',
    name: 'Sandálias de Espuma',
    description: 'Leves como a espuma que desliza sobre a maré.',
    slot: 'feet',
    minLevel: 6,
    classes: null,
    bonusRanges: { attributes: { agi: [2, 4] } },
  },

  // ── Nível 12: Desfiladeiro dos Trovões ────────────────────────────────────
  {
    id: 'montante-do-trovao',
    name: 'Montante do Trovão',
    description: 'Espada larga que zumbe antes de cada tempestade.',
    slot: 'weapon',
    minLevel: 12,
    classes: MARTIAL,
    bonusRanges: { stats: { attack: [14, 20] }, attributes: { str: [1, 3] } },
  },
  {
    id: 'orbe-da-tempestade',
    name: 'Orbe da Tempestade',
    description: 'Esfera de vidro com um relâmpago aprisionado dentro.',
    slot: 'weapon',
    minLevel: 12,
    classes: ARCANE,
    bonusRanges: { stats: { attack: [14, 20] }, attributes: { int: [1, 3] } },
  },
  {
    id: 'elmo-de-basalto',
    name: 'Elmo de Basalto',
    description: 'Pesado, mas quase impossível de rachar.',
    slot: 'head',
    minLevel: 12,
    classes: null,
    bonusRanges: { stats: { defense: [6, 10] }, attributes: { vit: [1, 3] } },
  },
  {
    id: 'couraca-do-trovao',
    name: 'Couraça do Trovão',
    description: 'Placas que dissipam a eletricidade pelo chão.',
    slot: 'chest',
    minLevel: 12,
    classes: null,
    bonusRanges: { stats: { maxHp: [40, 60], defense: [4, 7] } },
  },
  {
    id: 'manoplas-de-faisca',
    name: 'Manoplas de Faísca',
    description: 'Cada golpe solta uma chuva de centelhas.',
    slot: 'hands',
    minLevel: 12,
    classes: null,
    bonusRanges: { stats: { critChanceBp: [150, 300], attack: [3, 5] } },
  },
  {
    id: 'grevas-de-granito',
    name: 'Grevas de Granito',
    description: 'Pedra polida presa por tiras de couro curtido.',
    slot: 'legs',
    minLevel: 12,
    classes: null,
    bonusRanges: { stats: { maxHp: [30, 45], defense: [2, 4] } },
  },
  {
    id: 'botas-de-relampago',
    name: 'Botas de Relâmpago',
    description: 'Deixam marcas chamuscadas a cada passo.',
    slot: 'feet',
    minLevel: 12,
    classes: null,
    bonusRanges: { attributes: { agi: [4, 6] } },
  },
];

export const ITEMS: Readonly<Record<string, ItemDefinition>> = Object.fromEntries(
  LIST.map((i) => [i.id, i]),
);

/** Arma inicial concedida a cada classe na criação do personagem. */
export const STARTER_WEAPON: Readonly<Record<ClassId, string>> = {
  guardian: 'maca-do-juramento',
  arcanist: 'cajado-do-aprendiz',
  blade: 'adaga-do-cometa',
};

export interface UsabilityCheck {
  usable: boolean;
  reason: 'ok' | 'level' | 'class';
}

/** Regras de quem pode equipar o item. O servidor sempre revalida. */
export function canEquip(def: ItemDefinition, classId: ClassId, level: number): UsabilityCheck {
  if (def.classes !== null && !def.classes.includes(classId)) return { usable: false, reason: 'class' };
  if (level < def.minLevel) return { usable: false, reason: 'level' };
  return { usable: true, reason: 'ok' };
}
