import { describe, expect, it } from 'vitest';
import { APPEARANCE_OPTIONS } from '@astral/shared';
import {
  CLOAK_COLORS,
  HAIR_COLORS,
  HERO_FRAMES,
  MONSTER_LOOKS,
  SKIN_TONES,
  SPROUT_FRAMES,
  heroSprite,
  heroTextureKey,
  spriteSize,
  type PixelSprite,
} from './pixelArt';

function assertValid(sprite: PixelSprite, label: string) {
  const { width } = spriteSize(sprite);
  for (const row of sprite.rows) {
    expect(row, label).toHaveLength(width);
    for (const ch of row)
      if (ch !== '.') expect(sprite.palette[ch], `${label} cor '${ch}'`).toBeDefined();
  }
}

describe('sprites em pixel art', () => {
  it('herói, monstros e quadros têm linhas uniformes e cores definidas', () => {
    [...HERO_FRAMES, ...SPROUT_FRAMES].forEach((s, i) => assertValid(s, `quadro ${i}`));
    for (const [id, look] of Object.entries(MONSTER_LOOKS)) assertValid(look.sprite, id);
  });

  it('existe um visual para cada monstro do jogo', async () => {
    const { MONSTERS } = await import('@astral/game-core');
    for (const id of Object.keys(MONSTERS)) expect(MONSTER_LOOKS[id], id).toBeDefined();
  });

  it('as paletas cobrem todas as opções de aparência aceitas pelo servidor', () => {
    expect(HAIR_COLORS).toHaveLength(APPEARANCE_OPTIONS.hair);
    expect(SKIN_TONES).toHaveLength(APPEARANCE_OPTIONS.skin);
    expect(CLOAK_COLORS).toHaveLength(APPEARANCE_OPTIONS.cloak);
  });

  it('monta o herói 16×16 para cada classe e aparência', () => {
    for (const classId of ['guardian', 'arcanist', 'blade'] as const) {
      for (const frame of [0, 1] as const) {
        const sprite = heroSprite({ classId, appearance: { hair: 5, skin: 4, cloak: 5 } }, frame);
        assertValid(sprite, `${classId}-${frame}`);
        expect(spriteSize(sprite)).toEqual({ width: 16, height: 16 });
      }
    }
    const a = heroTextureKey({ classId: 'blade', appearance: { hair: 1, skin: 2, cloak: 3 } }, 0);
    const b = heroTextureKey({ classId: 'blade', appearance: { hair: 1, skin: 2, cloak: 4 } }, 0);
    expect(a).not.toBe(b);
  });
});
