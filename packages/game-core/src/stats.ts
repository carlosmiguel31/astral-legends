import { AFFINITIES } from './content/affinities.js';
import { CLASSES } from './content/classes.js';
import { BP, applyBp, assertNonNegativeInt, clamp, mulDiv } from './imath.js';
import { MAX_LEVEL } from './progression.js';
import type { AffinityId, Attributes, ClassId, CombatStats, EquipSlot, Rarity } from './types.js';

export const CRIT_CHANCE_CAP_BP = 6_000;
export const MIN_ATTACK_INTERVAL_MS = 400;
/** Cada +1 de aprimoramento amplia os bônus do item em 8%. */
export const UPGRADE_STEP_BP = 800;
export const MAX_UPGRADE_LEVEL = 15;

/** Bônus planos de um item já gerado (os valores sorteados ficam persistidos no item). */
export interface ItemBonuses {
  attributes?: Partial<Attributes>;
  stats?: Partial<Pick<CombatStats, 'maxHp' | 'attack' | 'defense' | 'critChanceBp'>>;
}

export interface EquippedItem {
  slot: EquipSlot;
  rarity: Rarity;
  upgradeLevel: number;
  bonuses: ItemBonuses;
}

export interface CharacterBuild {
  classId: ClassId;
  affinity: AffinityId;
  level: number;
  equipment: readonly EquippedItem[];
}

export function attributesAtLevel(classId: ClassId, level: number): Attributes {
  assertNonNegativeInt(level, 'level');
  if (level < 1 || level > MAX_LEVEL) throw new RangeError(`nível fora do intervalo: ${level}`);
  const def = CLASSES[classId];
  const n = level - 1;
  return {
    str: def.baseAttributes.str + def.growthPerLevel.str * n,
    int: def.baseAttributes.int + def.growthPerLevel.int * n,
    agi: def.baseAttributes.agi + def.growthPerLevel.agi * n,
    vit: def.baseAttributes.vit + def.growthPerLevel.vit * n,
  };
}

function upgraded(value: number, upgradeLevel: number): number {
  return applyBp(value, BP + upgradeLevel * UPGRADE_STEP_BP);
}

function validateEquipment(equipment: readonly EquippedItem[]): void {
  const seen = new Set<EquipSlot>();
  for (const item of equipment) {
    if (seen.has(item.slot)) throw new Error(`slot duplicado: ${item.slot}`);
    seen.add(item.slot);
    assertNonNegativeInt(item.upgradeLevel, 'upgradeLevel');
    if (item.upgradeLevel > MAX_UPGRADE_LEVEL) {
      throw new RangeError(`aprimoramento acima do máximo: ${item.upgradeLevel}`);
    }
  }
}

export interface DerivedBuild {
  /** Atributos finais (classe + nível + equipamento). */
  attributes: Attributes;
  stats: CombatStats;
}

/** Atributos finais do personagem, incluindo equipamento. */
export function computeAttributes(build: CharacterBuild): Attributes {
  return deriveBuild(build).attributes;
}

export function computeCombatStats(build: CharacterBuild): CombatStats {
  return deriveBuild(build).stats;
}

/**
 * Calcula atributos e estatísticas de combate finais de um personagem.
 * Ordem: atributos (classe + nível + itens) → derivadas → bônus planos de itens
 * → passiva de afinidade → limites.
 */
export function deriveBuild(build: CharacterBuild): DerivedBuild {
  validateEquipment(build.equipment);
  const cls = CLASSES[build.classId];
  const attrs = attributesAtLevel(build.classId, build.level);
  const flat = { maxHp: 0, attack: 0, defense: 0, critChanceBp: 0 };

  for (const item of build.equipment) {
    const a = item.bonuses.attributes ?? {};
    attrs.str += upgraded(a.str ?? 0, item.upgradeLevel);
    attrs.int += upgraded(a.int ?? 0, item.upgradeLevel);
    attrs.agi += upgraded(a.agi ?? 0, item.upgradeLevel);
    attrs.vit += upgraded(a.vit ?? 0, item.upgradeLevel);
    const s = item.bonuses.stats ?? {};
    flat.maxHp += upgraded(s.maxHp ?? 0, item.upgradeLevel);
    flat.attack += upgraded(s.attack ?? 0, item.upgradeLevel);
    flat.defense += upgraded(s.defense ?? 0, item.upgradeLevel);
    flat.critChanceBp += upgraded(s.critChanceBp ?? 0, item.upgradeLevel);
  }

  const primary = cls.primaryAttribute === 'str' ? attrs.str : attrs.int;
  let maxHp = 50 + attrs.vit * 10 + flat.maxHp;
  let attack = primary * 2 + flat.attack;
  const defense = Math.floor((attrs.vit + attrs.str) / 2) + flat.defense;
  let critChanceBp = 500 + attrs.agi * 20 + flat.critChanceBp;
  let attackIntervalMs = mulDiv(cls.baseAttackIntervalMs, BP, BP + attrs.agi * 30);

  const passive = AFFINITIES[build.affinity].passive;
  switch (passive.kind) {
    case 'attackBp':
      attack = applyBp(attack, BP + passive.value);
      break;
    case 'maxHpBp':
      maxHp = applyBp(maxHp, BP + passive.value);
      break;
    case 'critChanceFlatBp':
      critChanceBp += passive.value;
      break;
    case 'attackSpeedBp':
      attackIntervalMs = mulDiv(attackIntervalMs, BP, BP + passive.value);
      break;
  }

  return {
    attributes: attrs,
    stats: {
      maxHp,
      attack,
      defense,
      critChanceBp: clamp(critChanceBp, 0, CRIT_CHANCE_CAP_BP),
      critPowerBp: cls.baseCritPowerBp,
      attackIntervalMs: Math.max(MIN_ATTACK_INTERVAL_MS, attackIntervalMs),
      armorPenBp: cls.armorPenBp,
      damageReductionBp: cls.damageReductionBp,
    },
  };
}
