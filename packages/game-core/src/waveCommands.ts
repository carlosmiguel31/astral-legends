/**
 * Comandos do jogador sobre a wave (Fase 2A). Funções puras: o servidor valida e
 * aplica exatamente estas regras, sempre numa fronteira bem definida (ver ADR-08).
 */

import type { RegionDefinition } from './content/regions.js';
import { checkWaveSelection, type HuntMode, type WaveSelectionCheck } from './content/waves.js';
import { initialWaveProgress, validateWaveProgress, type WaveProgress } from './idle.js';

export interface WaveSettings {
  mode?: HuntMode;
  wave?: number;
}

export class WaveSelectionError extends Error {
  constructor(
    readonly reason: Exclude<WaveSelectionCheck, { ok: true }>['reason'],
    readonly minLevel?: number,
  ) {
    super(`wave indisponível: ${reason}`);
    this.name = 'WaveSelectionError';
  }
}

/**
 * Aplica uma mudança de modo e/ou wave.
 *  - Só modo: mantém a wave e as vitórias já obtidas nela (alternar não perde progresso).
 *  - Outra wave: precisa estar desbloqueada e permitida pelo nível; recomeça a contagem.
 *  - Pedido igual ao estado atual: nada muda (`changed = false`), o que torna repetições
 *    e cliques simultâneos de várias abas idempotentes.
 * Em qualquer mudança, avisos automáticos e a sequência de falhas são zerados.
 */
export function applyWaveSettings(
  region: RegionDefinition,
  current: WaveProgress,
  settings: WaveSettings,
  level: number,
): { progress: WaveProgress; changed: boolean } {
  validateWaveProgress(region, current);
  const mode = settings.mode ?? current.mode;
  const wave = settings.wave ?? current.wave;

  if (wave !== current.wave) {
    const check = checkWaveSelection(region, wave, current.highestCleared, level);
    if (!check.ok) throw new WaveSelectionError(check.reason, check.minLevel);
    return { progress: initialWaveProgress(mode, wave, current.highestCleared), changed: true };
  }
  if (mode === current.mode) return { progress: current, changed: false };
  return { progress: { ...current, mode, failStreak: 0, notice: null }, changed: true };
}
