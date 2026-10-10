/**
 * Regras de waves (Fase 2A). Todos os valores são inteiros; percentuais em bp.
 * Alterar qualquer número aqui muda resultados: incremente `RULESET_VERSION`.
 */

import { BP, applyBp } from '../imath.js';
import type { Rarity } from '../types.js';
import type { MonsterDefinition } from './monsters.js';
import type { RegionDefinition } from './regions.js';

export const WAVE_RULES = {
  /** Vitórias necessárias para concluir uma wave (o encontro especial conta como a última). */
  winsPerWave: 15,
  /** Waves múltiplas deste número terminam com um elite (se não forem de chefe). */
  eliteEvery: 5,
  /** Waves múltiplas deste número terminam com o chefe da região. */
  bossEvery: 10,
  /**
   * Quantidade de waves prevista por região no desenho final. Define a curva de nível
   * mínimo, mesmo que a região ainda tenha menos waves implementadas.
   */
  designWavesPerRegion: 10,
  /** Crescimento de vida, ataque e defesa dos monstros comuns por wave acima da 1ª. */
  statGrowthBpPerWave: 400,
  /** Teto do crescimento de atributos (×1,6). */
  maxStatBp: 16_000,
  /**
   * Crescimento de XP e ouro dos monstros comuns por wave acima da 1ª. Maior que o dos
   * atributos para que avançar renda um pouco mais por hora que farmar waves baixas.
   */
  rewardGrowthBpPerWave: 500,
  /** Teto do crescimento de recompensas (×1,45). */
  maxRewardBp: 14_500,
  /** No modo Avançar, falhas seguidas (derrota ou fuga) que fazem o herói recuar uma wave. */
  retreatAfterFailures: 3,
  /** Recompensas exclusivas da primeira conclusão de cada wave. */
  firstClear: {
    /** Ouro = goldPerWave × wave × tier da região. */
    goldPerWave: 50,
    /** Essência = essenceBase + floor(wave / 5), × tier. */
    essenceBase: 1,
    eliteItemRarity: 'rare' satisfies Rarity,
    bossItemRarity: 'epic' satisfies Rarity,
    bossEssenceBonus: 5,
  },
} as const;

export type WaveKind = 'normal' | 'elite' | 'boss';
export type HuntMode = 'advance' | 'farm';
export const HUNT_MODES: readonly HuntMode[] = ['advance', 'farm'];

/** Tipo da wave (pelo encontro que a encerra). */
export function waveKind(wave: number): WaveKind {
  if (wave % WAVE_RULES.bossEvery === 0) return 'boss';
  if (wave % WAVE_RULES.eliteEvery === 0) return 'elite';
  return 'normal';
}

/**
 * Tipo do encontro na posição `wins` (vitórias já obtidas na wave, 0-based).
 * O encontro especial ocupa a última posição: a wave continua tendo 15 vitórias.
 * Derrotas não avançam a posição, então o especial se repete até ser vencido.
 */
export function encounterKind(wave: number, wins: number): WaveKind {
  return wins === WAVE_RULES.winsPerWave - 1 ? waveKind(wave) : 'normal';
}

export function waveCount(region: RegionDefinition): number {
  return region.waves.count;
}

/**
 * Nível mínimo do personagem para entrar (ou avançar para) a wave.
 * Cresce linearmente do nível mínimo ao máximo da região ao longo das waves previstas.
 */
export function waveMinLevel(region: RegionDefinition, wave: number): number {
  const span = region.maxLevel - region.minLevel;
  const steps = WAVE_RULES.designWavesPerRegion - 1;
  return region.minLevel + Math.floor(((wave - 1) * span) / steps);
}

/** Maior wave desbloqueada pela progressão (independente de nível). */
export function unlockedWave(region: RegionDefinition, highestCleared: number): number {
  return Math.min(highestCleared + 1, waveCount(region));
}

export type WaveSelectionCheck =
  { ok: true } | { ok: false; reason: 'invalid' | 'locked' | 'level'; minLevel?: number };

/** Uma wave pode ser escolhida se existir, estiver desbloqueada e o nível permitir. */
export function checkWaveSelection(
  region: RegionDefinition,
  wave: number,
  highestCleared: number,
  level: number,
): WaveSelectionCheck {
  if (!Number.isSafeInteger(wave) || wave < 1 || wave > waveCount(region)) {
    return { ok: false, reason: 'invalid' };
  }
  if (wave > unlockedWave(region, highestCleared)) return { ok: false, reason: 'locked' };
  const minLevel = waveMinLevel(region, wave);
  if (level < minLevel) return { ok: false, reason: 'level', minLevel };
  return { ok: true };
}

/** Maior wave que o personagem pode escolher agora (pelo menos 1). */
export function maxSelectableWave(
  region: RegionDefinition,
  highestCleared: number,
  level: number,
): number {
  let wave = unlockedWave(region, highestCleared);
  while (wave > 1 && level < waveMinLevel(region, wave)) wave -= 1;
  return wave;
}

export function waveStatBp(wave: number): number {
  return Math.min(BP + (wave - 1) * WAVE_RULES.statGrowthBpPerWave, WAVE_RULES.maxStatBp);
}

export function waveRewardBp(wave: number): number {
  return Math.min(BP + (wave - 1) * WAVE_RULES.rewardGrowthBpPerWave, WAVE_RULES.maxRewardBp);
}

/**
 * Monstro comum ajustado à wave. Na wave 1 os multiplicadores são exatamente 100%:
 * o resultado é idêntico ao da Fase 1. Elites e chefes não escalam (atributos próprios).
 */
export function scaledMonster(def: MonsterDefinition, wave: number): MonsterDefinition {
  if (def.isBoss || def.isElite) return def;
  const statBp = waveStatBp(wave);
  const rewardBp = waveRewardBp(wave);
  if (statBp === BP && rewardBp === BP) return def;
  return {
    ...def,
    stats: {
      ...def.stats,
      maxHp: Math.max(1, applyBp(def.stats.maxHp, statBp)),
      attack: applyBp(def.stats.attack, statBp),
      defense: applyBp(def.stats.defense, statBp),
    },
    rewards: {
      ...def.rewards,
      xp: applyBp(def.rewards.xp, rewardBp),
      goldMin: applyBp(def.rewards.goldMin, rewardBp),
      goldMax: applyBp(def.rewards.goldMax, rewardBp),
    },
  };
}

/** Moedas da primeira conclusão (o item, se houver, é sorteado com o RNG do encontro). */
export function firstClearCurrency(
  region: RegionDefinition,
  wave: number,
): { gold: number; essence: number } {
  const tier = region.waves.rewardTier;
  const rules = WAVE_RULES.firstClear;
  const bossBonus = waveKind(wave) === 'boss' ? rules.bossEssenceBonus : 0;
  return {
    gold: rules.goldPerWave * wave * tier,
    essence: (rules.essenceBase + Math.floor(wave / WAVE_RULES.eliteEvery)) * tier + bossBonus,
  };
}

export function firstClearItemRarity(wave: number): Rarity | null {
  const kind = waveKind(wave);
  if (kind === 'boss') return WAVE_RULES.firstClear.bossItemRarity;
  if (kind === 'elite') return WAVE_RULES.firstClear.eliteItemRarity;
  return null;
}
