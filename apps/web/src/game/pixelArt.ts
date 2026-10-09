/**
 * Sprites em pixel art originais descritos como texto (um caractere por pixel).
 * São arte provisória de autoria própria até a chegada da arte definitiva.
 */

import type { Appearance } from '@astral/shared';

export type Palette = Readonly<Record<string, string>>;

export interface PixelSprite {
  rows: readonly string[];
  palette: Palette;
}

type ClassId = 'guardian' | 'arcanist' | 'blade';

// ───────────────────────────── Herói ─────────────────────────────

export const HAIR_COLORS = [
  '#d9dcf2',
  '#2b2340',
  '#8a4b2a',
  '#e8c170',
  '#c94f6d',
  '#5fb8d9',
] as const;
export const SKIN_TONES = ['#f6d7b8', '#f2c9a0', '#d9a066', '#a8714a', '#6e4630'] as const;
export const CLOAK_COLORS: ReadonlyArray<readonly [string, string]> = [
  ['#3b4cca', '#6f86ff'],
  ['#b33a4a', '#e36a7a'],
  ['#2f7a4f', '#5cbf86'],
  ['#6b3fb3', '#a07af0'],
  ['#a8792a', '#e0b25c'],
  ['#2a7f86', '#5ec4c9'],
];

const HERO_BASE: Palette = {
  k: '#1a1530', // contorno
  g: '#f2c46d', // ouro
  w: '#ffffff', // estrela no peito
  b: '#2a2140', // botas
  m: '#c9d2e8', // metal
  n: '#7a5232', // madeira
  G: '#e0b25c', // escudo
  y: '#fff3a8', // brilho
};

const HERO_PALETTE: Palette = {
  ...HERO_BASE,
  h: HAIR_COLORS[0],
  s: SKIN_TONES[1],
  c: CLOAK_COLORS[0]![0],
  C: CLOAK_COLORS[0]![1],
};

const HERO_TOP = [
  '....kkkk....',
  '...khhhhk...',
  '..khhhhhhk..',
  '..khsssshk..',
  '..kskssksk..',
  '...kssssk...',
  '..kcccccck..',
  '.kccgwgccck.',
  '.kcCcgccCck.',
  'kcCccccccCck',
  'kcCccccccCck',
  '.kcccccccck.',
  '..kcccccck..',
];

const LEGS = [
  ['..kbbkkbbk..', '..kbbk.kbbk.', '..kkk...kkk.'],
  ['..kbbkkbbk..', '.kbbk.kbbk..', '.kkk...kkk..'],
] as const;

export const HERO_FRAMES: readonly PixelSprite[] = LEGS.map((legs) => ({
  palette: HERO_PALETTE,
  rows: [...HERO_TOP, ...legs],
}));

/** Pixels da arma de cada classe, em coordenadas do sprite 16×16. */
const WEAPONS: Record<ClassId, ReadonlyArray<readonly [number, number, string]>> = {
  // Adaga curta na mão direita.
  blade: [
    [14, 5, 'm'],
    [14, 6, 'm'],
    [14, 7, 'm'],
    [14, 8, 'm'],
    [13, 9, 'g'],
    [14, 9, 'g'],
    [15, 9, 'g'],
    [14, 10, 'n'],
  ],
  // Cajado alto com uma estrela na ponta.
  arcanist: [
    [14, 0, 'y'],
    [13, 1, 'y'],
    [14, 1, 'w'],
    [15, 1, 'y'],
    [14, 2, 'y'],
    ...Array.from({ length: 12 }, (_, i) => [14, 3 + i, 'n'] as const),
  ],
  // Escudo redondo no braço esquerdo.
  guardian: [
    [0, 8, 'k'],
    [1, 7, 'k'],
    [1, 8, 'G'],
    [1, 9, 'G'],
    [1, 10, 'G'],
    [1, 11, 'k'],
    [2, 7, 'k'],
    [2, 8, 'G'],
    [2, 9, 'y'],
    [2, 10, 'G'],
    [2, 11, 'k'],
    [0, 9, 'k'],
    [0, 10, 'k'],
  ],
};

export interface HeroLook {
  classId: ClassId;
  appearance: Appearance;
}

/** Monta o herói 16×16 com a aparência escolhida e a arma da classe. */
export function heroSprite(look: HeroLook, frame: 0 | 1): PixelSprite {
  const { hair, skin, cloak } = look.appearance;
  const cloakPair = CLOAK_COLORS[cloak] ?? CLOAK_COLORS[0]!;
  const palette: Palette = {
    ...HERO_BASE,
    h: HAIR_COLORS[hair] ?? HAIR_COLORS[0],
    s: SKIN_TONES[skin] ?? SKIN_TONES[0],
    c: cloakPair[0],
    C: cloakPair[1],
  };
  const grid = [...HERO_TOP, ...LEGS[frame]].map((row) => [...`..${row}..`]);
  for (const [x, y, ch] of WEAPONS[look.classId]) {
    const row = grid[y];
    if (row) row[x] = ch;
  }
  return { palette, rows: grid.map((r) => r.join('')) };
}

export function heroTextureKey(look: HeroLook, frame: 0 | 1): string {
  const a = look.appearance;
  return `hero-${look.classId}-${a.hair}-${a.skin}-${a.cloak}-${frame}`;
}

// ───────────────────────────── Monstros ─────────────────────────────

const SPROUT_ROWS = [
  '.....ll.....',
  '....lLLl....',
  '.....ll.....',
  '....kkkk....',
  '..kkyyyykk..',
  '.kyyYyyyyyk.',
  'kyyykyykyyyk',
  'kyyyyyyyyyyk',
  'kyyYyyyyYyyk',
  '.kyyyyyyyyk.',
  '..kkkkkkkk..',
  '............',
];

export const SPROUT_FRAMES: readonly PixelSprite[] = [
  {
    palette: { k: '#1d2a1c', l: '#6fd36a', L: '#b6f7a6', y: '#fff3a8', Y: '#f2c46d' },
    rows: SPROUT_ROWS,
  },
  {
    palette: { k: '#1d2a1c', l: '#6fd36a', L: '#b6f7a6', y: '#fff8c9', Y: '#f2c46d' },
    rows: [
      '....l..l....',
      '.....LL.....',
      '.....ll.....',
      '....kkkk....',
      '..kkyyyykk..',
      '.kyyyyYyyyk.',
      'kyyykyykyyyk',
      'kyyyyyyyyyyk',
      'kyyyYyyyYyyk',
      '.kyyyyyyyyk.',
      '..kkkkkkkk..',
      '............',
    ],
  },
];

const BEAST = [
  '..........kk..',
  '.........kBBk.',
  '........kbbebk',
  'k......kbbbbbk',
  'tk..kkkbbbbbk.',
  '.tkkbbbbbbBk..',
  '..kbBbbbbbbk..',
  '..kbkkbbbkbk..',
  '..kbk.kbk.kbk.',
  '..kk..kk...kk.',
];

const GOLEM = [
  '....kkkk....',
  '...kCCCck...',
  '..kCceecCk..',
  '..kcCccCck..',
  '.kkkcccckkk.',
  'kCcCkcckCcCk',
  'kcccCccCccck',
  'kCcckCCkccCk',
  '.kkkcccckkk.',
  '...kcCCck...',
  '..kcck.kcck.',
  '..kCck.kcCk.',
  '..kcck.kcck.',
  '..kkkk.kkkk.',
];

const JELLY = [
  '....kkkk....',
  '..kkJJJJkk..',
  '.kJJjJJJJJk.',
  'kJJJJJJjJJJk',
  'kJJeJJJJeJJk',
  'kJJJJJJJJJJk',
  '.kkkkkkkkkk.',
  '..t.t..t.t..',
  '..t..t.t..t.',
  '.t...t..t.t.',
  '.t..t...t..t',
  '....t.....t.',
];

const ROOT = [
  '...kkkkkk...',
  '..kLLlLLLk..',
  '.kLlLLLlLLk.',
  'kLLLlLLLLlLk',
  '.kLLLLLLLLk.',
  '..kkkbbkkk..',
  '....kbbk....',
  '...kbebbk...',
  '...kbbebk...',
  '...kbbbbk...',
  '..kbbbbbbk..',
  '.kbbkbbkbbk.',
  'kbk.kbbk.kbk',
  'kk..kkkk..kk',
];

const SERPENT = [
  '..........kkk.',
  '.........kSSek',
  '........kSSSSk',
  '..kkk..kSSkkk.',
  '.kSSSk.kSSk...',
  'kSsSSSkSSSk...',
  'kSk.kSSSSk....',
  '.k...kkkk.....',
];

export interface MonsterLook {
  sprite: PixelSprite;
  /** Escala relativa (chefes são maiores). */
  scale: number;
}

export const MONSTER_LOOKS: Readonly<Record<string, MonsterLook>> = {
  brotolume: { sprite: SPROUT_FRAMES[0]!, scale: 1 },
  'lobo-cometa': {
    sprite: {
      rows: BEAST,
      palette: { k: '#1a1530', b: '#3f4a7a', B: '#7f95e0', e: '#ffe27a', t: '#ffd37a' },
    },
    scale: 1,
  },
  'vigia-de-quartzo': {
    sprite: { rows: GOLEM, palette: { k: '#2a2440', C: '#e8e2ff', c: '#a99bd6', e: '#7fe3ff' } },
    scale: 1,
  },
  'colosso-do-eclipse-menor': {
    sprite: { rows: GOLEM, palette: { k: '#120c1c', C: '#4b3a6b', c: '#2d2140', e: '#ff5d7a' } },
    scale: 1.8,
  },
  'lince-de-mare': {
    sprite: {
      rows: BEAST,
      palette: { k: '#1d2633', b: '#8aa4b8', B: '#d6e6f2', e: '#7fe3d0', t: '#c9d6ff' },
    },
    scale: 1,
  },
  'agua-viva-prateada': {
    sprite: {
      rows: JELLY,
      palette: { k: '#3d4a6b', J: '#c9d6ff', j: '#ffffff', e: '#3b4cca', t: '#a6b8e8' },
    },
    scale: 1,
  },
  'raiz-sussurrante': {
    sprite: {
      rows: ROOT,
      palette: { k: '#1a1420', L: '#3a5f4a', l: '#5c8f6a', b: '#5a4636', e: '#b58cff' },
    },
    scale: 1.2,
  },
  'grifo-de-faisca': {
    sprite: {
      rows: BEAST,
      palette: { k: '#2a1d10', b: '#c99a3a', B: '#ffe08a', e: '#7fe3ff', t: '#fff3a8' },
    },
    scale: 1.15,
  },
  'golem-de-basalto': {
    sprite: { rows: GOLEM, palette: { k: '#141010', C: '#5a5050', c: '#3a3434', e: '#ff9b3d' } },
    scale: 1.3,
  },
  'serpente-de-relampago': {
    sprite: { rows: SERPENT, palette: { k: '#0d2433', S: '#3fb8d9', s: '#e8fbff', e: '#fff36a' } },
    scale: 1.2,
  },
};

// ───────────────────────────── Utilitários ─────────────────────────────

/** Desenha o sprite em um canvas 2D e valida que todas as linhas têm a mesma largura. */
export function paintSprite(
  ctx: CanvasRenderingContext2D,
  sprite: PixelSprite,
  scale = 1,
  offsetX = 0,
  offsetY = 0,
): void {
  const width = sprite.rows[0]?.length ?? 0;
  sprite.rows.forEach((row, y) => {
    if (row.length !== width)
      throw new Error(`linha ${y} com largura ${row.length}, esperado ${width}`);
    for (let x = 0; x < row.length; x += 1) {
      const color = sprite.palette[row[x]!];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(offsetX + x * scale, offsetY + y * scale, scale, scale);
    }
  });
}

export function spriteSize(sprite: PixelSprite): { width: number; height: number } {
  return { width: sprite.rows[0]?.length ?? 0, height: sprite.rows.length };
}
