import { describe, expect, it } from 'vitest';
import { farmComparison, simulateAll, type RegionRun } from '../scripts/balance.js';

/**
 * Guardas de balanceamento. Rodam o motor real por 12 h simuladas para as 3 classes ×
 * 4 afinidades em cada região. Se um ajuste de números quebrar estes limites, revise
 * docs/BALANCE.md antes de mudar o teste.
 */
const runs = simulateAll();
const byRegion = (id: string): RegionRun[] => runs.filter((r) => r.regionId === id);

describe('ritmo de progressão por waves (modo Avançar)', () => {
  it('Campos: toda combinação de classe e afinidade conclui as 10 waves em até 90 min', () => {
    for (const r of byRegion('campos-do-alvorecer')) {
      const label = `${r.classId}/${r.affinity}`;
      expect(
        r.clearedAtMin.every((m) => m !== null && m <= 90),
        label,
      ).toBe(true);
      expect(r.winRateBp, label).toBeGreaterThanOrEqual(9_800);
    }
  });

  it('Campos: as primeiras waves são acessíveis a iniciantes (wave 1 em até 10 min)', () => {
    for (const r of byRegion('campos-do-alvorecer'))
      expect(r.clearedAtMin[0]).toBeLessThanOrEqual(10);
  });

  it('Bosque: conclui as 4 waves implementadas em até 60 min, sem recuos', () => {
    for (const r of byRegion('bosque-das-mares-de-prata')) {
      expect(
        r.clearedAtMin.every((m) => m !== null && m <= 60),
        `${r.classId}/${r.affinity}`,
      ).toBe(true);
      expect(r.retreats).toBe(0);
    }
  });

  it('Desfiladeiro: desafiador, mas concluído por todos em até 4 h', () => {
    for (const r of byRegion('desfiladeiro-dos-trovoes')) {
      const label = `${r.classId}/${r.affinity}`;
      expect(
        r.clearedAtMin.every((m) => m !== null && m <= 240),
        label,
      ).toBe(true);
      expect(r.winRateBp, label).toBeGreaterThanOrEqual(8_800);
    }
  });
});

describe('repetir uma wave não rende mais que avançar', () => {
  const farm = farmComparison();
  const at = (wave: number) => farm.find((f) => f.wave === wave)!;

  it('XP/h cresce com a wave nas waves comuns', () => {
    for (const wave of [2, 3, 4, 6, 7, 8, 9]) {
      expect(at(wave).xpPerHour, `wave ${wave}`).toBeGreaterThanOrEqual(at(1).xpPerHour * 0.98);
    }
    expect(at(9).xpPerHour).toBeGreaterThan(at(1).xpPerHour);
  });

  it('waves de elite e de chefe não viram o loop ótimo de farm', () => {
    expect(at(5).xpPerHour).toBeLessThanOrEqual(at(4).xpPerHour * 1.2);
    expect(at(10).xpPerHour).toBeLessThanOrEqual(at(9).xpPerHour * 1.3);
    expect(at(10).goldPerHour).toBeLessThanOrEqual(at(9).goldPerHour * 1.2);
    expect(at(5).itemsPerHour).toBeLessThanOrEqual(at(4).itemsPerHour * 1.3);
    expect(at(10).itemsPerHour).toBeLessThanOrEqual(at(9).itemsPerHour * 1.3);
  });
});
