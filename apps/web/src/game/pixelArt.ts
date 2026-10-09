/**
 * Sprites em pixel art originais descritos como texto (um caractere por pixel).
 * São placeholders de autoria própria até a chegada da arte definitiva.
 */

export type Palette = Readonly<Record<string, string>>;

export interface PixelSprite {
  rows: readonly string[];
  palette: Palette;
}

const HERO_PALETTE: Palette = {
  k: '#1a1530', // contorno
  h: '#d9dcf2', // cabelo prateado
  s: '#f2c9a0', // pele
  c: '#3b4cca', // manto
  C: '#6f86ff', // brilho do manto
  g: '#f2c46d', // ouro
  w: '#ffffff', // estrela no peito
  b: '#2a2140', // botas
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

export const HERO_FRAMES: readonly PixelSprite[] = [
  { palette: HERO_PALETTE, rows: [...HERO_TOP, '..kbbkkbbk..', '..kbbk.kbbk.', '..kkk...kkk.'] },
  { palette: HERO_PALETTE, rows: [...HERO_TOP, '..kbbkkbbk..', '.kbbk.kbbk..', '.kkk...kkk..'] },
];

export const SPROUT_FRAMES: readonly PixelSprite[] = [
  {
    palette: { k: '#1d2a1c', l: '#6fd36a', L: '#b6f7a6', y: '#fff3a8', Y: '#f2c46d' },
    rows: [
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
    ],
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

/** Desenha o sprite em um canvas 2D e valida que todas as linhas têm a mesma largura. */
export function paintSprite(ctx: CanvasRenderingContext2D, sprite: PixelSprite): void {
  const width = sprite.rows[0]?.length ?? 0;
  sprite.rows.forEach((row, y) => {
    if (row.length !== width)
      throw new Error(`linha ${y} com largura ${row.length}, esperado ${width}`);
    for (let x = 0; x < row.length; x += 1) {
      const color = sprite.palette[row[x]!];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  });
}

export function spriteSize(sprite: PixelSprite): { width: number; height: number } {
  return { width: sprite.rows[0]?.length ?? 0, height: sprite.rows.length };
}
