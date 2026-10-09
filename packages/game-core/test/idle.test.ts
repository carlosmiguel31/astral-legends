import { describe, expect, it } from 'vitest';
import {
  DEFEAT_RECOVERY_MS,
  OFFLINE_CAP_MS,
  RegionLockedError,
  SEARCH_MS,
  resolveEncounter,
  settleHunt,
  type HuntCharacter,
  type SettleHuntInput,
} from '../src/idle.js';
import { REGIONS } from '../src/content/regions.js';
import { computeCombatStats } from '../src/stats.js';
import { CLASS_IDS } from '../src/types.js';

const HOUR = 60 * 60 * 1_000;
const T0 = 1_790_000_000_000;

function hero(overrides: Partial<HuntCharacter> = {}): HuntCharacter {
  return { classId: 'blade', affinity: 'lunar', level: 1, xp: 0, equipment: [], ...overrides };
}

function input(overrides: Partial<SettleHuntInput> = {}): SettleHuntInput {
  return {
    regionId: 'campos-do-alvorecer',
    seed: 123_456,
    nextEncounter: 0,
    lastSettledAtMs: T0,
    nowMs: T0 + HOUR,
    character: hero(),
    ...overrides,
  };
}

describe('settleHunt', () => {
  it('é determinístico: mesma entrada ⇒ mesmo resultado', () => {
    expect(settleHunt(input())).toEqual(settleHunt(input()));
  });

  it('não muda o resultado conforme a frequência das liquidações', () => {
    const once = settleHunt(input({ nowMs: T0 + 2 * HOUR }));

    // Liquida a mesma janela em 37 pedaços irregulares, encadeando o estado.
    let state = { next: 0, last: T0, level: 1, xp: 0 };
    let gold = 0;
    let essence = 0;
    let wins = 0;
    const drops: unknown[] = [];
    for (let now = T0 + 1_234; now <= T0 + 2 * HOUR; now += 197_531) {
      const r = settleHunt(
        input({
          nextEncounter: state.next,
          lastSettledAtMs: state.last,
          nowMs: now,
          character: hero({ level: state.level, xp: state.xp }),
        }),
      );
      state = { next: r.nextEncounter, last: r.windowEndMs, level: r.level, xp: r.xp };
      gold += r.gold;
      essence += r.essence;
      wins += r.wins;
      drops.push(...r.drops);
    }
    const tail = settleHunt(
      input({
        nextEncounter: state.next,
        lastSettledAtMs: state.last,
        nowMs: T0 + 2 * HOUR,
        character: hero({ level: state.level, xp: state.xp }),
      }),
    );

    expect(tail.nextEncounter).toBe(once.nextEncounter);
    expect(tail.windowEndMs).toBe(once.windowEndMs);
    expect(tail.level).toBe(once.level);
    expect(tail.xp).toBe(once.xp);
    expect(gold + tail.gold).toBe(once.gold);
    expect(essence + tail.essence).toBe(once.essence);
    expect(wins + tail.wins).toBe(once.wins);
    expect([...drops, ...tail.drops]).toEqual(once.drops);
  });

  it('só resolve encontros completos; a sobra fica para a próxima liquidação', () => {
    const r = settleHunt(input({ nowMs: T0 + 60_000 }));
    expect(r.windowEndMs).toBeLessThanOrEqual(T0 + 60_000);
    expect(r.encounters).toBeGreaterThan(0);
    for (const e of r.recent) expect(e.endedAtMs).toBeLessThanOrEqual(T0 + 60_000);

    const again = settleHunt(
      input({ nextEncounter: r.nextEncounter, lastSettledAtMs: r.windowEndMs, nowMs: T0 + 60_000 }),
    );
    expect(again.encounters).toBe(0);
    expect(again.gold).toBe(0);
  });

  it('nada acontece antes do primeiro encontro terminar', () => {
    const r = settleHunt(input({ nowMs: T0 + SEARCH_MS }));
    expect(r.encounters).toBe(0);
    expect(r.windowEndMs).toBe(T0);
  });

  it('respeita o teto offline de 8 horas', () => {
    const r = settleHunt(input({ nowMs: T0 + 30 * HOUR }));
    expect(r.forfeitedMs).toBe(22 * HOUR);
    expect(r.windowStartMs).toBe(T0 + 22 * HOUR);
    expect(r.windowEndMs - r.windowStartMs).toBeLessThanOrEqual(OFFLINE_CAP_MS);

    const exactly8h = settleHunt(input({ nowMs: T0 + 8 * HOUR }));
    expect(r.encounters).toBe(exactly8h.encounters);
    expect(r.gold).toBe(exactly8h.gold);
  });

  it('a linha do tempo é contínua e cada encontro dura ao menos o tempo de procura', () => {
    const r = settleHunt(input({ nowMs: T0 + 10 * 60_000 }));
    for (let i = 1; i < r.recent.length; i += 1) {
      expect(r.recent[i]!.startedAtMs).toBe(r.recent[i - 1]!.endedAtMs);
      expect(r.recent[i]!.endedAtMs - r.recent[i]!.startedAtMs).toBeGreaterThanOrEqual(SEARCH_MS);
    }
  });

  it('concede XP, ouro e sobe de nível', () => {
    const r = settleHunt(input());
    expect(r.wins).toBeGreaterThan(100);
    expect(r.xpGained).toBeGreaterThan(0);
    expect(r.gold).toBeGreaterThan(0);
    expect(r.level).toBeGreaterThan(1);
    expect(r.recent.some((e) => e.levelUp) || r.level > r.levelBefore).toBe(true);
  });

  it('derrota e fuga não dão recompensa; derrota custa o tempo de recuperação', () => {
    // O Vigia de Quartzo (nível 5) costuma derrotar Guardiões de nível 1.
    const region = REGIONS['campos-do-alvorecer']!;
    const character = hero({ classId: 'guardian' });
    const failed = Array.from(
      { length: 300 },
      (_, index) =>
        resolveEncounter({
          region,
          seed: 7,
          index,
          startedAtMs: 0,
          stats: computeCombatStats(character),
          character,
          recordEvents: false,
        }).summary,
    ).filter((e) => e.outcome !== 'win');
    expect(failed.length).toBeGreaterThan(0);
    for (const e of failed) {
      expect(e.xp + e.gold + e.essence).toBe(0);
      expect(e.drop).toBeNull();
      if (e.outcome === 'loss') {
        expect(e.endedAtMs - e.combatStartMs - e.combatMs).toBe(DEFEAT_RECOVERY_MS);
      }
    }
  });

  it('bloqueia regiões acima do nível do personagem', () => {
    expect(() => settleHunt(input({ regionId: 'bosque-das-mares-de-prata' }))).toThrow(
      RegionLockedError,
    );
    expect(() =>
      settleHunt(input({ regionId: 'bosque-das-mares-de-prata', character: hero({ level: 6 }) })),
    ).not.toThrow();
  });

  it('equipamento melhora o desempenho', () => {
    const plain = settleHunt(input());
    const geared = settleHunt(
      input({
        character: hero({
          equipment: [
            { slot: 'weapon', rarity: 'epic', upgradeLevel: 0, bonuses: { stats: { attack: 20 } } },
          ],
        }),
      }),
    );
    expect(geared.encounters).toBeGreaterThan(plain.encounters);
  });

  it('inclui os golpes apenas dos últimos encontros pedidos, idênticos ao combate original', () => {
    const r = settleHunt(input({ nowMs: T0 + 5 * 60_000, includeEventsForLast: 3 }));
    const withEvents = r.recent.filter((e) => e.events);
    expect(withEvents).toHaveLength(3);
    for (const e of withEvents) {
      // O último golpe pode exceder a vida restante; por isso ≥.
      const dealt = e
        .events!.filter((ev) => ev.attacker === 'player')
        .reduce((sum, ev) => sum + ev.damage, 0);
      expect(dealt).toBeGreaterThanOrEqual(e.damageDealt);
      expect(e.events!.at(-1)!.atMs).toBe(e.combatMs);
    }
  });

  it('drops são estáveis e identificados pelo encontro que os gerou', () => {
    const r = settleHunt(input({ nowMs: T0 + 8 * HOUR }));
    expect(r.drops.length).toBeGreaterThan(0);
    const indexes = r.drops.map((d) => d.encounterIndex);
    expect(new Set(indexes).size).toBe(indexes.length);
    for (const d of r.drops) expect(['common', 'rare', 'epic']).toContain(d.rarity);
  });

  it('registra o nível no início de cada encontro', () => {
    const r = settleHunt(input({ nowMs: T0 + 2 * HOUR }));
    for (const e of r.recent) expect(e.levelAfter).toBeGreaterThanOrEqual(e.levelBefore);
  });

  it('mantém resultados fixos (regressão do ruleset)', () => {
    const r = settleHunt(input({ nowMs: T0 + HOUR }));
    expect({
      encounters: r.encounters,
      wins: r.wins,
      losses: r.losses,
      level: r.level,
      xp: r.xp,
      gold: r.gold,
      essence: r.essence,
      drops: r.drops.map((d) => `${d.encounterIndex}:${d.defId}:${d.rarity}`),
      windowEndMs: r.windowEndMs - T0,
    }).toMatchSnapshot();
  });
});

describe('resolveEncounter', () => {
  it('cada classe vence o monstro mais comum da região inicial', () => {
    const region = REGIONS['campos-do-alvorecer']!;
    for (const classId of CLASS_IDS) {
      const character = hero({ classId });
      let wins = 0;
      for (let index = 0; index < 200; index += 1) {
        const { summary } = resolveEncounter({
          region,
          seed: 99,
          index,
          startedAtMs: 0,
          stats: computeCombatStats(character),
          character,
          recordEvents: false,
        });
        if (summary.monsterId !== 'brotolume') continue;
        if (summary.outcome === 'win') wins += 1;
        else throw new Error(`${classId} perdeu para brotolume no encontro ${index}`);
      }
      expect(wins).toBeGreaterThan(0);
    }
  });
});
