import { describe, expect, it } from 'vitest';
import { HERO_FRAMES, SPROUT_FRAMES, spriteSize } from './pixelArt';

describe('sprites em pixel art', () => {
  it.each([...HERO_FRAMES, ...SPROUT_FRAMES].map((s, i) => [i, s] as const))(
    'sprite %i tem linhas de largura uniforme e cores definidas',
    (_i, sprite) => {
      const { width } = spriteSize(sprite);
      for (const row of sprite.rows) {
        expect(row).toHaveLength(width);
        for (const ch of row)
          if (ch !== '.') expect(sprite.palette[ch], `cor '${ch}'`).toBeDefined();
      }
    },
  );

  it('quadros de uma mesma animação têm o mesmo tamanho', () => {
    expect(spriteSize(HERO_FRAMES[0]!)).toEqual(spriteSize(HERO_FRAMES[1]!));
    expect(spriteSize(SPROUT_FRAMES[0]!)).toEqual(spriteSize(SPROUT_FRAMES[1]!));
  });
});
