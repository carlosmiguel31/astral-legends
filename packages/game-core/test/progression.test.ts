import { describe, expect, it } from 'vitest';
import { MAX_LEVEL, applyXp, xpForKill, xpToNextLevel } from '../src/progression.js';

describe('xpToNextLevel', () => {
  it('segue a curva 40·L² + 60·L', () => {
    expect(xpToNextLevel(1)).toBe(100);
    expect(xpToNextLevel(2)).toBe(280);
    expect(xpToNextLevel(10)).toBe(4_600);
    expect(xpToNextLevel(MAX_LEVEL)).toBe(0);
  });

  it('é estritamente crescente até o nível máximo', () => {
    for (let l = 1; l < MAX_LEVEL - 1; l += 1) {
      expect(xpToNextLevel(l + 1)).toBeGreaterThan(xpToNextLevel(l));
    }
  });
});

describe('applyXp', () => {
  it('acumula sem subir de nível', () => {
    expect(applyXp({ level: 1, xp: 0 }, 99)).toEqual({
      level: 1,
      xp: 99,
      levelsGained: 0,
      xpDiscarded: 0,
    });
  });

  it('processa várias subidas de nível de uma vez', () => {
    // 100 (1→2) + 280 (2→3) = 380; sobram 20.
    expect(applyXp({ level: 1, xp: 0 }, 400)).toEqual({
      level: 3,
      xp: 20,
      levelsGained: 2,
      xpDiscarded: 0,
    });
  });

  it('para no nível máximo e descarta o excedente', () => {
    const result = applyXp({ level: MAX_LEVEL - 1, xp: 0 }, 10_000_000);
    expect(result.level).toBe(MAX_LEVEL);
    expect(result.xp).toBe(0);
    expect(result.xpDiscarded).toBeGreaterThan(0);
  });
});

describe('xpForKill', () => {
  it('não penaliza até 2 níveis de diferença', () => {
    expect(xpForKill(100, 5, 3)).toBe(100);
    expect(xpForKill(100, 1, 6)).toBe(100);
  });

  it('reduz 20% por nível excedente, com piso de 10%', () => {
    expect(xpForKill(100, 6, 3)).toBe(80);
    expect(xpForKill(100, 8, 3)).toBe(40);
    expect(xpForKill(100, 30, 1)).toBe(10);
  });
});
