import { describe, expect, it } from 'vitest';
import { ITEMS, RARITY_INFO, STARTER_WEAPON, canEquip } from '../src/content/items.js';
import { REGIONS } from '../src/content/regions.js';
import { pickWeighted, rollItemBonuses, rollRarity } from '../src/loot.js';
import { createRng } from '../src/rng.js';

describe('rollRarity', () => {
  it('distribui ~3% épico, ~17% raro e ~80% comum', () => {
    const rng = createRng(1);
    const counts = { common: 0, rare: 0, epic: 0 } as Record<string, number>;
    const n = 50_000;
    for (let i = 0; i < n; i += 1) counts[rollRarity(rng)]! += 1;
    expect(counts.epic! / n).toBeCloseTo(0.03, 2);
    expect(counts.rare! / n).toBeCloseTo(0.17, 2);
    expect(counts.common! / n).toBeCloseTo(0.8, 2);
    expect(rng.draws).toBe(n);
  });
});

describe('rollItemBonuses', () => {
  it('é determinístico e respeita as faixas multiplicadas pela raridade', () => {
    for (const def of Object.values(ITEMS)) {
      for (const rarity of ['common', 'rare', 'epic'] as const) {
        for (let seed = 0; seed < 20; seed += 1) {
          const a = rollItemBonuses(def.id, rarity, createRng(seed));
          const b = rollItemBonuses(def.id, rarity, createRng(seed));
          expect(a).toEqual(b);
          const mult = RARITY_INFO[rarity].multiplierBp;
          const all = { ...a.attributes, ...a.stats } as Record<string, number>;
          const ranges = { ...def.bonusRanges.attributes, ...def.bonusRanges.stats } as Record<
            string,
            readonly [number, number]
          >;
          for (const [key, value] of Object.entries(all)) {
            expect(Number.isSafeInteger(value)).toBe(true);
            expect(value).toBeGreaterThan(0);
            expect(value).toBeLessThanOrEqual(Math.floor((ranges[key]![1] * mult) / 10_000));
          }
        }
      }
    }
  });

  it('itens épicos são mais fortes que comuns com o mesmo sorteio', () => {
    const common = rollItemBonuses('peitoral-do-alvorecer', 'common', createRng(5));
    const epic = rollItemBonuses('peitoral-do-alvorecer', 'epic', createRng(5));
    expect(epic.stats!.maxHp!).toBeGreaterThan(common.stats!.maxHp!);
  });

  it('rejeita itens inexistentes', () => {
    expect(() => rollItemBonuses('nao-existe', 'common', createRng(1))).toThrow();
  });
});

describe('pickWeighted', () => {
  it('respeita os pesos', () => {
    const rng = createRng(3);
    const table = REGIONS['campos-do-alvorecer']!.spawns;
    const counts: Record<string, number> = {};
    for (let i = 0; i < 10_000; i += 1) {
      const id = pickWeighted(table, rng).monsterId;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    expect(counts['brotolume']! / 10_000).toBeCloseTo(0.6, 1);
    expect(counts['vigia-de-quartzo']! / 10_000).toBeCloseTo(0.1, 1);
  });
});

describe('canEquip', () => {
  it('restringe por classe e nível', () => {
    const sabre = ITEMS['sabre-de-mare']!;
    expect(canEquip(sabre, 'blade', 6)).toEqual({ usable: true, reason: 'ok' });
    expect(canEquip(sabre, 'blade', 5)).toEqual({ usable: false, reason: 'level' });
    expect(canEquip(sabre, 'arcanist', 20)).toEqual({ usable: false, reason: 'class' });
  });

  it('cada classe pode usar sua arma inicial', () => {
    for (const [classId, itemId] of Object.entries(STARTER_WEAPON)) {
      expect(canEquip(ITEMS[itemId]!, classId as 'blade', 1).usable).toBe(true);
    }
  });
});
