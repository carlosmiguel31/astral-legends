import type { PixelSprite } from '../game/pixelArt';

/**
 * Ícones de recompensa em pixel art (16×16), originais. Renderizados como SVG com
 * `shape-rendering: crispEdges`: pixels nítidos em qualquer escala, sem canvas.
 */
export const PIXEL_ICONS = {
  coin: {
    palette: { k: '#5a3a0a', G: '#c98a1f', Y: '#fcd34d', w: '#fff7d6' },
    rows: [
      '................',
      '.....kkkkkk.....',
      '...kkGGGGGGkk...',
      '..kGGYYYYYYGGk..',
      '..kGYYYYYYYYGk..',
      '.kGYYYYwYYYYYGk.',
      '.kGYYYwwwYYYYGk.',
      '.kGYwwwwwwwYYGk.',
      '.kGYYwwwwwYYYGk.',
      '.kGYYwwYwwYYYGk.',
      '.kGYYwYYYwYYYGk.',
      '..kGYYYYYYYYGk..',
      '..kGGYYYYYYGGk..',
      '...kkGGGGGGkk...',
      '.....kkkkkk.....',
      '................',
    ],
  },
  essence: {
    palette: { k: '#2a1660', w: '#f3ecff', v: '#c4a6ff', V: '#8b5cf6', P: '#5b2bb8' },
    rows: [
      '................',
      '.......kk.......',
      '......kwvk......',
      '.....kwvvVk.....',
      '....kwvvvVVk....',
      '...kwvvvvVVVk...',
      '..kwvvvvvVVVVk..',
      '..kvvvvvvVVVVk..',
      '..kvvvvvVVVVPk..',
      '...kvvvvVVVPk...',
      '....kvvvVVPk....',
      '.....kvvVPk.....',
      '......kvPk......',
      '.......kk.......',
      '................',
      '................',
    ],
  },
  chest: {
    palette: { k: '#2a1608', b: '#8a4b1c', B: '#b8692a', G: '#f2c46d', Y: '#fff1b8' },
    rows: [
      '................',
      '................',
      '..kkkkkkkkkkkk..',
      '.kbbbbbbbbbbbbk.',
      '.kbBBBBBBBBBBbk.',
      '.kGGGGGGGGGGGGk.',
      '.kbbbbbYYbbbbbk.',
      '.kGGGGGYYGGGGGk.',
      '.kbbbbbYYbbbbbk.',
      '.kbBBBBBBBBBBbk.',
      '.kbBBBBBBBBBBbk.',
      '.kGGGGGGGGGGGGk.',
      '.kkkkkkkkkkkkkk.',
      '................',
      '................',
      '................',
    ],
  },
  star: {
    palette: { k: '#5a3a0a', Y: '#fcd34d', w: '#fff7d6' },
    rows: [
      '.......k........',
      '......kYk.......',
      '......kYk.......',
      '.....kYwYk......',
      '.....kYwYk......',
      'kkkkkYYwYYkkkkk.',
      '.kYYYYwwwYYYYk..',
      '..kYYwwwwwYYk...',
      '...kYYwwwYYk....',
      '...kYYYwYYYk....',
      '..kYYYkkkYYYk...',
      '..kYYk...kYYk...',
      '.kYk.......kYk..',
      '.kk.........kk..',
      '................',
      '................',
    ],
  },
} satisfies Record<string, PixelSprite>;

export type PixelIconName = keyof typeof PIXEL_ICONS;

/** Agrupa pixels vizinhos da mesma cor em retângulos (SVG menor). */
function runs(sprite: PixelSprite): Array<{ x: number; y: number; w: number; color: string }> {
  const out: Array<{ x: number; y: number; w: number; color: string }> = [];
  sprite.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x]!;
      const color = sprite.palette[ch];
      if (!color) {
        x += 1;
        continue;
      }
      let end = x + 1;
      while (end < row.length && row[end] === ch) end += 1;
      out.push({ x, y, w: end - x, color });
      x = end;
    }
  });
  return out;
}

export function PixelIcon({
  name,
  className = 'size-6',
  title,
}: {
  name: PixelIconName;
  className?: string;
  title?: string;
}) {
  const sprite: PixelSprite = PIXEL_ICONS[name];
  const width = sprite.rows[0]?.length ?? 16;
  return (
    <svg
      viewBox={`0 0 ${width} ${sprite.rows.length}`}
      shapeRendering="crispEdges"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {runs(sprite).map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.color} />
      ))}
    </svg>
  );
}
