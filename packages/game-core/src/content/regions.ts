export interface RegionDefinition {
  id: string;
  name: string;
  description: string;
  minLevel: number;
  maxLevel: number;
  /** Monstros comuns e seus pesos de aparição. */
  spawns: ReadonlyArray<{ monsterId: string; weight: number }>;
  bossId: string | null;
}

export const REGIONS: Readonly<Record<string, RegionDefinition>> = {
  'campos-do-alvorecer': {
    id: 'campos-do-alvorecer',
    name: 'Campos do Alvorecer',
    description:
      'Planícies onde a primeira luz de cada dia cai como poeira estelar. Ponto de partida de todo despertar.',
    minLevel: 1,
    maxLevel: 6,
    spawns: [
      { monsterId: 'brotolume', weight: 60 },
      { monsterId: 'lobo-cometa', weight: 30 },
      { monsterId: 'vigia-de-quartzo', weight: 10 },
    ],
    bossId: 'colosso-do-eclipse-menor',
  },
};
