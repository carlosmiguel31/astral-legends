import { describe, expect, it } from 'vitest';
import { affinityMultiplierBp } from '../src/content/affinities.js';
import { CLASS_IDS, AFFINITY_IDS } from '../src/types.js';
import { CRIT_CHANCE_CAP_BP, attributesAtLevel, computeCombatStats } from '../src/stats.js';

describe('attributesAtLevel', () => {
  it('aplica o crescimento da classe por nível', () => {
    expect(attributesAtLevel('guardian', 1)).toEqual({ str: 8, int: 3, agi: 4, vit: 12 });
    expect(attributesAtLevel('guardian', 11)).toEqual({ str: 28, int: 3, agi: 14, vit: 42 });
  });
});

describe('computeCombatStats', () => {
  it('deriva estatísticas do Guardião nível 1 (afinidade Lunar)', () => {
    expect(
      computeCombatStats({ classId: 'guardian', affinity: 'lunar', level: 1, equipment: [] }),
    ).toEqual({
      maxHp: 170,
      attack: 16,
      defense: 10,
      critChanceBp: 880,
      critPowerBp: 15_000,
      attackIntervalMs: 1_581,
      armorPenBp: 0,
      damageReductionBp: 1_000,
    });
  });

  it('aplica a passiva de afinidade', () => {
    const base = { classId: 'blade' as const, level: 5, equipment: [] };
    const solar = computeCombatStats({ ...base, affinity: 'solar' });
    const lunar = computeCombatStats({ ...base, affinity: 'lunar' });
    const storm = computeCombatStats({ ...base, affinity: 'storm' });
    const abyssal = computeCombatStats({ ...base, affinity: 'abyssal' });
    expect(solar.attack).toBeGreaterThan(lunar.attack);
    expect(lunar.critChanceBp).toBe(solar.critChanceBp + 300);
    expect(storm.attackIntervalMs).toBeLessThan(solar.attackIntervalMs);
    expect(abyssal.maxHp).toBeGreaterThan(solar.maxHp);
  });

  it('soma equipamentos e amplia bônus por aprimoramento', () => {
    const plain = computeCombatStats({
      classId: 'arcanist',
      affinity: 'storm',
      level: 1,
      equipment: [],
    });
    const withStaff = computeCombatStats({
      classId: 'arcanist',
      affinity: 'storm',
      level: 1,
      equipment: [
        { slot: 'weapon', rarity: 'rare', upgradeLevel: 0, bonuses: { stats: { attack: 10 } } },
      ],
    });
    const upgradedStaff = computeCombatStats({
      classId: 'arcanist',
      affinity: 'storm',
      level: 1,
      equipment: [
        { slot: 'weapon', rarity: 'rare', upgradeLevel: 5, bonuses: { stats: { attack: 10 } } },
      ],
    });
    expect(withStaff.attack - plain.attack).toBe(10);
    expect(upgradedStaff.attack - plain.attack).toBe(14); // +40%
  });

  it('rejeita dois itens no mesmo slot', () => {
    const item = { slot: 'head' as const, rarity: 'common' as const, upgradeLevel: 0, bonuses: {} };
    expect(() =>
      computeCombatStats({
        classId: 'blade',
        affinity: 'solar',
        level: 1,
        equipment: [item, item],
      }),
    ).toThrow(/slot duplicado/);
  });

  it('respeita o teto de crítico e o intervalo mínimo', () => {
    const stats = computeCombatStats({
      classId: 'blade',
      affinity: 'lunar',
      level: 30,
      equipment: [
        {
          slot: 'hands',
          rarity: 'astral',
          upgradeLevel: 15,
          bonuses: { stats: { critChanceBp: 9_000 } },
        },
      ],
    });
    expect(stats.critChanceBp).toBe(CRIT_CHANCE_CAP_BP);
    expect(stats.attackIntervalMs).toBeGreaterThanOrEqual(400);
  });

  it('produz apenas inteiros para todas as combinações de classe/afinidade/nível', () => {
    for (const classId of CLASS_IDS) {
      for (const affinity of AFFINITY_IDS) {
        for (let level = 1; level <= 30; level += 1) {
          const s = computeCombatStats({ classId, affinity, level, equipment: [] });
          for (const v of Object.values(s)) expect(Number.isSafeInteger(v)).toBe(true);
        }
      }
    }
  });
});

describe('affinityMultiplierBp', () => {
  it('forma um ciclo Solar > Abissal > Lunar > Tempestade > Solar', () => {
    expect(affinityMultiplierBp('solar', 'abyssal')).toBe(12_500);
    expect(affinityMultiplierBp('abyssal', 'lunar')).toBe(12_500);
    expect(affinityMultiplierBp('lunar', 'storm')).toBe(12_500);
    expect(affinityMultiplierBp('storm', 'solar')).toBe(12_500);
    expect(affinityMultiplierBp('abyssal', 'solar')).toBe(8_000);
    expect(affinityMultiplierBp('solar', 'lunar')).toBe(10_000);
    expect(affinityMultiplierBp('solar', 'solar')).toBe(10_000);
  });

  it('cada afinidade vence exatamente uma e perde para exatamente uma', () => {
    for (const a of AFFINITY_IDS) {
      const wins = AFFINITY_IDS.filter((b) => affinityMultiplierBp(a, b) > 10_000);
      const losses = AFFINITY_IDS.filter((b) => affinityMultiplierBp(a, b) < 10_000);
      expect(wins).toHaveLength(1);
      expect(losses).toHaveLength(1);
    }
  });
});
