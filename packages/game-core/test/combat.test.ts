import { describe, expect, it } from 'vitest';
import { simulateCombat, rollDamage, type Combatant } from '../src/combat.js';
import { MONSTERS } from '../src/content/monsters.js';
import { createRng } from '../src/rng.js';
import { computeCombatStats } from '../src/stats.js';
import { CLASS_IDS } from '../src/types.js';

function monster(id: string): Combatant {
  const def = MONSTERS[id];
  if (!def) throw new Error(`monstro ${id} não encontrado`);
  return { stats: def.stats, affinity: def.affinity };
}

function hero(classId: (typeof CLASS_IDS)[number], level = 1): Combatant {
  return {
    stats: computeCombatStats({ classId, affinity: 'lunar', level, equipment: [] }),
    affinity: 'lunar',
  };
}

describe('simulateCombat', () => {
  it('é determinístico: mesma entrada e semente ⇒ mesmo resultado', () => {
    const input = {
      player: hero('blade'),
      monster: monster('lobo-cometa'),
      seed: 2026,
      recordEvents: true,
    };
    expect(simulateCombat(input)).toEqual(simulateCombat(input));
  });

  it('sementes diferentes podem produzir combates diferentes', () => {
    const results = new Set<string>();
    for (let seed = 0; seed < 30; seed += 1) {
      const r = simulateCombat({ player: hero('blade'), monster: monster('lobo-cometa'), seed });
      results.add(`${r.winner}:${r.durationMs}:${r.playerHp}`);
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('mantém resultados fixos (regressão de balanceamento)', () => {
    const summary = CLASS_IDS.map((classId) => {
      const r = simulateCombat({ player: hero(classId), monster: monster('brotolume'), seed: 1 });
      return {
        classId,
        winner: r.winner,
        durationMs: r.durationMs,
        playerHp: r.playerHp,
        actions: r.actions,
      };
    });
    expect(summary).toMatchSnapshot();
  });

  it('todas as classes nível 1 vencem o monstro inicial na maioria das sementes', () => {
    for (const classId of CLASS_IDS) {
      let wins = 0;
      for (let seed = 0; seed < 200; seed += 1) {
        if (
          simulateCombat({ player: hero(classId), monster: monster('brotolume'), seed }).winner ===
          'player'
        )
          wins += 1;
      }
      expect(wins, classId).toBeGreaterThanOrEqual(190);
    }
  });

  it('o chefe derrota personagens nível 1', () => {
    for (const classId of CLASS_IDS) {
      const r = simulateCombat({
        player: hero(classId),
        monster: monster('colosso-do-eclipse-menor'),
        seed: 3,
      });
      expect(r.winner, classId).toBe('monster');
    }
  });

  it('respeita conservação de vida e ordem temporal dos eventos', () => {
    const p = hero('guardian');
    const m = monster('vigia-de-quartzo');
    const r = simulateCombat({ player: p, monster: m, seed: 11, recordEvents: true });
    expect(r.playerHp).toBe(p.stats.maxHp - r.monsterDamageDealt);
    expect(r.monsterHp).toBe(m.stats.maxHp - r.playerDamageDealt);
    const times = r.events!.map((e) => e.atMs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(r.events).toHaveLength(r.actions);
    expect(r.rngDraws).toBeGreaterThanOrEqual(r.actions * 2);
  });

  it('o jogador age primeiro em empate de tempo', () => {
    const stats = { ...MONSTERS['brotolume']!.stats, attackIntervalMs: 1_000 };
    const r = simulateCombat({
      player: { stats, affinity: 'solar' },
      monster: { stats, affinity: 'solar' },
      seed: 1,
      recordEvents: true,
    });
    expect(r.events![0]!.attacker).toBe('player');
  });

  it('encerra por tempo limite quando ninguém consegue vencer', () => {
    const tank = { ...MONSTERS['brotolume']!.stats, maxHp: 1_000_000, attack: 1 };
    const r = simulateCombat({
      player: { stats: tank, affinity: 'solar' },
      monster: { stats: tank, affinity: 'solar' },
      seed: 1,
      maxDurationMs: 10_000,
    });
    expect(r.winner).toBe('timeout');
    expect(r.durationMs).toBe(10_000);
  });

  it('rejeita estatísticas não inteiras vindas de qualquer origem', () => {
    const bad = { ...MONSTERS['brotolume']!.stats, attack: 10.5 };
    expect(() =>
      simulateCombat({
        player: { stats: bad, affinity: 'solar' },
        monster: monster('brotolume'),
        seed: 1,
      }),
    ).toThrow(RangeError);
  });
});

describe('rollDamage', () => {
  it('sempre causa ao menos 1 de dano e consome 2 valores do RNG', () => {
    const weak = {
      stats: { ...MONSTERS['brotolume']!.stats, attack: 0 },
      affinity: 'solar' as const,
    };
    const rng = createRng(1);
    const roll = rollDamage(weak, monster('vigia-de-quartzo'), rng);
    expect(roll.damage).toBe(1);
    expect(rng.draws).toBe(2);
  });

  it('vantagem de afinidade aumenta o dano médio', () => {
    const attacker = { stats: MONSTERS['brotolume']!.stats, affinity: 'solar' as const };
    const sum = (affinity: 'abyssal' | 'storm') => {
      const rng = createRng(77);
      const target = { stats: MONSTERS['lobo-cometa']!.stats, affinity };
      let total = 0;
      for (let i = 0; i < 500; i += 1) total += rollDamage(attacker, target, rng).damage;
      return total;
    };
    expect(sum('abyssal')).toBeGreaterThan(sum('storm'));
  });
});
