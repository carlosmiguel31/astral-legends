export type Difficulty = 'iniciante' | 'intermediária' | 'avançada';

export interface RegionDefinition {
  id: string;
  name: string;
  description: string;
  /** Nível mínimo para entrar (condição de desbloqueio). */
  minLevel: number;
  /** Nível a partir do qual a região deixa de ser desafiadora. */
  maxLevel: number;
  difficulty: Difficulty;
  /** Monstros comuns e seus pesos de aparição. */
  spawns: ReadonlyArray<{ monsterId: string; weight: number }>;
  /** Itens que podem cair na região e seus pesos. */
  loot: ReadonlyArray<{ itemId: string; weight: number }>;
  bossId: string | null;
}

const LIST: RegionDefinition[] = [
  {
    id: 'campos-do-alvorecer',
    name: 'Campos do Alvorecer',
    description:
      'Planícies onde a primeira luz de cada dia cai como poeira estelar. Ponto de partida de todo despertar.',
    minLevel: 1,
    maxLevel: 6,
    difficulty: 'iniciante',
    spawns: [
      { monsterId: 'brotolume', weight: 60 },
      { monsterId: 'lobo-cometa', weight: 30 },
      { monsterId: 'vigia-de-quartzo', weight: 10 },
    ],
    loot: [
      { itemId: 'lamina-curta-de-quartzo', weight: 10 },
      { itemId: 'varinha-de-orvalho', weight: 10 },
      { itemId: 'elmo-de-cobre-estelar', weight: 16 },
      { itemId: 'peitoral-do-alvorecer', weight: 16 },
      { itemId: 'luvas-de-couro-de-cometa', weight: 16 },
      { itemId: 'perneiras-de-linho-astral', weight: 16 },
      { itemId: 'botas-de-viajante', weight: 16 },
    ],
    bossId: 'colosso-do-eclipse-menor',
  },
  {
    id: 'bosque-das-mares-de-prata',
    name: 'Bosque das Marés de Prata',
    description:
      'Um bosque alagado onde a maré sobe com a lua. A névoa prateada esconde criaturas antigas.',
    minLevel: 6,
    maxLevel: 12,
    difficulty: 'intermediária',
    spawns: [
      { monsterId: 'lince-de-mare', weight: 60 },
      { monsterId: 'agua-viva-prateada', weight: 30 },
      { monsterId: 'raiz-sussurrante', weight: 10 },
    ],
    loot: [
      { itemId: 'sabre-de-mare', weight: 10 },
      { itemId: 'cetro-da-lua-crescente', weight: 10 },
      { itemId: 'elmo-de-mare', weight: 16 },
      { itemId: 'manto-de-prata-lunar', weight: 16 },
      { itemId: 'luvas-de-escama', weight: 16 },
      { itemId: 'grevas-de-coral', weight: 16 },
      { itemId: 'sandalias-de-espuma', weight: 16 },
    ],
    bossId: null,
  },
  {
    id: 'desfiladeiro-dos-trovoes',
    name: 'Desfiladeiro dos Trovões',
    description:
      'Paredões de basalto sob uma tempestade que nunca termina. Só os mais firmes chegam ao fundo.',
    minLevel: 12,
    maxLevel: 20,
    difficulty: 'avançada',
    spawns: [
      { monsterId: 'grifo-de-faisca', weight: 60 },
      { monsterId: 'golem-de-basalto', weight: 25 },
      { monsterId: 'serpente-de-relampago', weight: 15 },
    ],
    loot: [
      { itemId: 'montante-do-trovao', weight: 10 },
      { itemId: 'orbe-da-tempestade', weight: 10 },
      { itemId: 'elmo-de-basalto', weight: 16 },
      { itemId: 'couraca-do-trovao', weight: 16 },
      { itemId: 'manoplas-de-faisca', weight: 16 },
      { itemId: 'grevas-de-granito', weight: 16 },
      { itemId: 'botas-de-relampago', weight: 16 },
    ],
    bossId: null,
  },
];

export const REGIONS: Readonly<Record<string, RegionDefinition>> = Object.fromEntries(
  LIST.map((r) => [r.id, r]),
);

/** Ordem de progressão (para listar no cliente). */
export const REGION_ORDER: readonly string[] = LIST.map((r) => r.id);

export function isRegionUnlocked(region: RegionDefinition, level: number): boolean {
  return level >= region.minLevel;
}
