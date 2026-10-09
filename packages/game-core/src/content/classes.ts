import type { Attributes, ClassId } from '../types.js';

export interface ClassDefinition {
  id: ClassId;
  name: string;
  role: string;
  lore: string;
  /** Atributo que escala o ataque. */
  primaryAttribute: 'str' | 'int';
  baseAttributes: Attributes;
  /** Ganho de atributos a cada nível acima do 1. */
  growthPerLevel: Attributes;
  baseAttackIntervalMs: number;
  baseCritPowerBp: number;
  /** Passivas fixas da classe (bp). */
  armorPenBp: number;
  damageReductionBp: number;
}

export const CLASSES: Readonly<Record<ClassId, ClassDefinition>> = {
  guardian: {
    id: 'guardian',
    name: 'Guardião Astral',
    role: 'Tanque resistente, golpes lentos e pesados',
    lore: 'Juramentados às constelações protetoras, erguem muralhas de luz estelar entre o mundo e o Vazio.',
    primaryAttribute: 'str',
    baseAttributes: { str: 8, int: 3, agi: 4, vit: 12 },
    growthPerLevel: { str: 2, int: 0, agi: 1, vit: 3 },
    baseAttackIntervalMs: 1_600,
    baseCritPowerBp: 15_000,
    armorPenBp: 0,
    damageReductionBp: 1_000,
  },
  arcanist: {
    id: 'arcanist',
    name: 'Arcanista Celestial',
    role: 'Dano mágico elevado que ignora parte da defesa, porém frágil',
    lore: 'Leem as órbitas dos astros como grimórios e convertem o brilho das estrelas em feitiços.',
    primaryAttribute: 'int',
    baseAttributes: { str: 3, int: 12, agi: 5, vit: 7 },
    growthPerLevel: { str: 0, int: 3, agi: 1, vit: 2 },
    baseAttackIntervalMs: 1_500,
    baseCritPowerBp: 16_000,
    armorPenBp: 2_500,
    damageReductionBp: 0,
  },
  blade: {
    id: 'blade',
    name: 'Lâmina Estelar',
    role: 'Ataques rápidos e críticos frequentes',
    lore: 'Duelistas que cortam o céu noturno como cometas, guiados pelo rastro das estrelas cadentes.',
    primaryAttribute: 'str',
    baseAttributes: { str: 9, int: 3, agi: 10, vit: 8 },
    growthPerLevel: { str: 2, int: 0, agi: 3, vit: 2 },
    baseAttackIntervalMs: 1_100,
    baseCritPowerBp: 17_500,
    armorPenBp: 0,
    damageReductionBp: 0,
  },
};
