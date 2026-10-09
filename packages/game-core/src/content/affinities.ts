import { BP } from '../imath.js';
import type { AffinityId } from '../types.js';

export interface AffinityDefinition {
  id: AffinityId;
  name: string;
  description: string;
  /** Afinidade sobre a qual esta tem vantagem. */
  strongAgainst: AffinityId;
  /** Bônus passivo concedido ao personagem (bp sobre a estatística indicada). */
  passive:
    | { kind: 'attackBp'; value: number }
    | { kind: 'critChanceFlatBp'; value: number }
    | { kind: 'attackSpeedBp'; value: number }
    | { kind: 'maxHpBp'; value: number };
}

/**
 * Ciclo de vantagens: Solar > Abissal > Lunar > Tempestade > Solar.
 * Cada afinidade vence exatamente uma e perde para exatamente uma.
 */
export const AFFINITIES: Readonly<Record<AffinityId, AffinityDefinition>> = {
  solar: {
    id: 'solar',
    name: 'Solar',
    description: 'A luz que dissipa o Abismo. Fortalece o ataque.',
    strongAgainst: 'abyssal',
    passive: { kind: 'attackBp', value: 500 },
  },
  abyssal: {
    id: 'abyssal',
    name: 'Abissal',
    description: 'O vazio que engole o reflexo da Lua. Fortalece a vida.',
    strongAgainst: 'lunar',
    passive: { kind: 'maxHpBp', value: 800 },
  },
  lunar: {
    id: 'lunar',
    name: 'Lunar',
    description: 'A maré que doma a Tempestade. Aumenta a chance crítica.',
    strongAgainst: 'storm',
    passive: { kind: 'critChanceFlatBp', value: 300 },
  },
  storm: {
    id: 'storm',
    name: 'Tempestade',
    description: 'As nuvens que encobrem o Sol. Acelera os ataques.',
    strongAgainst: 'solar',
    passive: { kind: 'attackSpeedBp', value: 500 },
  },
};

export const AFFINITY_ADVANTAGE_BP = 12_500;
export const AFFINITY_DISADVANTAGE_BP = 8_000;

/** Multiplicador de dano (bp) de um atacante contra um defensor. */
export function affinityMultiplierBp(attacker: AffinityId, defender: AffinityId): number {
  if (AFFINITIES[attacker].strongAgainst === defender) return AFFINITY_ADVANTAGE_BP;
  if (AFFINITIES[defender].strongAgainst === attacker) return AFFINITY_DISADVANTAGE_BP;
  return BP;
}
