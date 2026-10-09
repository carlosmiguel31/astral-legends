import { BP, applyBp, assertNonNegativeInt } from './imath.js';

/** Nível máximo no MVP. Aumentar exige rever curva de XP e conteúdo. */
export const MAX_LEVEL = 30;

/** XP necessária para sair do nível `level` e chegar ao próximo: 40·L² + 60·L. */
export function xpToNextLevel(level: number): number {
  assertNonNegativeInt(level, 'level');
  if (level < 1 || level > MAX_LEVEL) throw new RangeError(`nível fora do intervalo: ${level}`);
  if (level === MAX_LEVEL) return 0;
  return 40 * level * level + 60 * level;
}

export interface LevelState {
  level: number;
  /** XP acumulada dentro do nível atual (sempre < xpToNextLevel(level)). */
  xp: number;
}

export interface XpGainResult extends LevelState {
  levelsGained: number;
  /** XP descartada por já estar no nível máximo. */
  xpDiscarded: number;
}

/** Aplica XP ganha, processando múltiplas subidas de nível de uma vez. */
export function applyXp(state: LevelState, gained: number): XpGainResult {
  assertNonNegativeInt(gained, 'gained');
  assertNonNegativeInt(state.xp, 'xp');
  let { level } = state;
  let xp = state.xp + gained;
  let levelsGained = 0;

  while (level < MAX_LEVEL) {
    const needed = xpToNextLevel(level);
    if (xp < needed) break;
    xp -= needed;
    level += 1;
    levelsGained += 1;
  }

  let xpDiscarded = 0;
  if (level === MAX_LEVEL) {
    xpDiscarded = xp;
    xp = 0;
  }
  return { level, xp, levelsGained, xpDiscarded };
}

/**
 * XP efetiva por abate considerando a diferença de nível.
 * Até 2 níveis acima do monstro: 100%. Depois, −20% por nível, mínimo 10%.
 * Monstros de nível superior não dão bônus (evita incentivo a "carregar" jogadores).
 */
export function xpForKill(baseXp: number, playerLevel: number, monsterLevel: number): number {
  assertNonNegativeInt(baseXp, 'baseXp');
  const diff = playerLevel - monsterLevel;
  if (diff <= 2) return baseXp;
  const penaltyBp = Math.min((diff - 2) * 2_000, BP - 1_000);
  return applyBp(baseXp, BP - penaltyBp);
}
