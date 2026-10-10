import { describe, expect, it } from 'vitest';
import {
  BACKDROP_H,
  BACKDROP_W,
  STAGE_FLOOR_Y,
  regionLook,
  torchPositions,
} from '../game/backdrop';
import { NAV_ITEMS } from '../screens/game/TopNav';
import { ICON_NAMES } from './icons';
import { PIXEL_ICONS } from './pixelIcons';

describe('design system', () => {
  it('ícones em pixel art têm 16×16 e todas as cores definidas', () => {
    for (const [name, sprite] of Object.entries(PIXEL_ICONS)) {
      expect(sprite.rows, name).toHaveLength(16);
      for (const row of sprite.rows) {
        expect(row, name).toHaveLength(16);
        for (const ch of row)
          if (ch !== '.')
            expect(
              sprite.palette[ch as keyof typeof sprite.palette],
              `${name} '${ch}'`,
            ).toBeDefined();
      }
    }
  });

  it('há ícones vetoriais para todos os slots de equipamento', () => {
    for (const slot of ['weapon', 'head', 'chest', 'hands', 'legs', 'feet'])
      expect(ICON_NAMES).toContain(slot);
  });

  it('só módulos implementados têm ação na navegação; os demais ficam "Em breve"', () => {
    const active = NAV_ITEMS.filter((i) => i.action).map((i) => i.label);
    expect(active).toEqual(['Jogar', 'Personagem', 'Inventário', 'Mapa']);
    const soon = NAV_ITEMS.filter((i) => !i.action).map((i) => i.label);
    expect(soon).toEqual(['Conquistas', 'Rankings', 'Chefes', 'PvP', 'Mercado', 'Passe']);
  });

  it('cenários: região desconhecida usa o visual inicial e as tochas ficam dentro do palco', () => {
    expect(regionLook('regiao-inexistente')).toBe(regionLook('campos-do-alvorecer'));
    for (const id of [
      'campos-do-alvorecer',
      'bosque-das-mares-de-prata',
      'desfiladeiro-dos-trovoes',
    ]) {
      for (const t of torchPositions(id)) {
        expect(t.x).toBeGreaterThan(0);
        expect(t.x).toBeLessThan(BACKDROP_W);
        expect(t.y).toBeLessThan(STAGE_FLOOR_Y);
      }
    }
    expect(BACKDROP_W / BACKDROP_H).toBeCloseTo(20 / 9, 5);
  });
});
