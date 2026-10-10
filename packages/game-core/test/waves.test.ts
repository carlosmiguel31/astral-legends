import { describe, expect, it } from 'vitest';
import { REGIONS } from '../src/content/regions.js';
import {
  WAVE_RULES,
  checkWaveSelection,
  encounterKind,
  firstClearCurrency,
  maxSelectableWave,
  scaledMonster,
  waveKind,
  waveMinLevel,
  waveStatBp,
  waveRewardBp,
} from '../src/content/waves.js';
import { MONSTERS } from '../src/content/monsters.js';
import {
  OFFLINE_CAP_MS,
  initialWaveProgress,
  resolveEncounter,
  settleHunt,
  type HuntCharacter,
  type SettleHuntResult,
  type WaveClearEvent,
  type WaveProgress,
} from '../src/idle.js';
import { computeCombatStats } from '../src/stats.js';
import { WaveSelectionError, applyWaveSettings } from '../src/waveCommands.js';

const CAMPOS = REGIONS['campos-do-alvorecer']!;
const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = 1_790_000_000_000;

function hero(overrides: Partial<HuntCharacter> = {}): HuntCharacter {
  return { classId: 'blade', affinity: 'lunar', level: 1, xp: 0, equipment: [], ...overrides };
}

/** Herói forte o suficiente para vencer qualquer encontro dos Campos (inclusive o chefe). */
const STRONG = hero({
  affinity: 'solar',
  level: 12,
  equipment: [
    { slot: 'weapon', rarity: 'epic', upgradeLevel: 0, bonuses: { stats: { attack: 30 } } },
    {
      slot: 'chest',
      rarity: 'epic',
      upgradeLevel: 0,
      bonuses: { stats: { maxHp: 300, defense: 20 } },
    },
  ],
});

/** Herói fraco contra o elite (Tempestade vence Solar). */
const WEAK = hero({ classId: 'guardian', affinity: 'solar', level: 1 });

function settle(progress: WaveProgress, character: HuntCharacter, durationMs: number, seed = 4242) {
  return settleHunt({
    regionId: CAMPOS.id,
    seed,
    nextEncounter: 0,
    lastSettledAtMs: T0,
    nowMs: T0 + durationMs,
    character,
    progress,
  });
}

function clears(r: SettleHuntResult): WaveClearEvent[] {
  return r.waveEvents.filter((e): e is WaveClearEvent => e.type === 'clear');
}

describe('regras de wave', () => {
  it('elite a cada 5 waves e chefe a cada 10, sempre na última posição', () => {
    expect([1, 4, 5, 9, 10, 15, 20].map(waveKind)).toEqual([
      'normal',
      'normal',
      'elite',
      'normal',
      'boss',
      'elite',
      'boss',
    ]);
    expect(encounterKind(5, 13)).toBe('normal');
    expect(encounterKind(5, 14)).toBe('elite');
    expect(encounterKind(10, 14)).toBe('boss');
    expect(encounterKind(3, 14)).toBe('normal');
  });

  it('nível mínimo cresce ao longo da região', () => {
    expect([1, 5, 9, 10].map((w) => waveMinLevel(CAMPOS, w))).toEqual([1, 3, 5, 6]);
    const bosque = REGIONS['bosque-das-mares-de-prata']!;
    expect([1, 2, 3, 4].map((w) => waveMinLevel(bosque, w))).toEqual([6, 6, 7, 8]);
  });

  it('crescimento de atributos e recompensas tem teto', () => {
    expect(waveStatBp(1)).toBe(10_000);
    expect(waveStatBp(6)).toBe(12_000);
    expect(waveStatBp(1_000)).toBe(WAVE_RULES.maxStatBp);
    expect(waveRewardBp(1_000)).toBe(WAVE_RULES.maxRewardBp);
  });

  it('wave 1 não altera o monstro; elites e chefes não escalam', () => {
    const brotolume = MONSTERS['brotolume']!;
    expect(scaledMonster(brotolume, 1)).toBe(brotolume);
    expect(scaledMonster(brotolume, 6).stats.maxHp).toBe(72);
    expect(scaledMonster(brotolume, 6).rewards.xp).toBe(10);
    const boss = MONSTERS['colosso-do-eclipse-menor']!;
    expect(scaledMonster(boss, 10)).toBe(boss);
  });

  it('seleção de wave: inexistente, bloqueada, por nível e permitida', () => {
    expect(checkWaveSelection(CAMPOS, 0, 9, 99)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkWaveSelection(CAMPOS, 11, 10, 99)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkWaveSelection(CAMPOS, 4, 2, 99)).toEqual({ ok: false, reason: 'locked' });
    expect(checkWaveSelection(CAMPOS, 3, 2, 99)).toEqual({ ok: true });
    expect(checkWaveSelection(CAMPOS, 10, 9, 5)).toEqual({
      ok: false,
      reason: 'level',
      minLevel: 6,
    });
    expect(maxSelectableWave(CAMPOS, 9, 5)).toBe(9);
    expect(maxSelectableWave(CAMPOS, 0, 1)).toBe(1);
  });

  it('recompensas de primeira conclusão crescem com a wave e o tier da região', () => {
    expect(firstClearCurrency(CAMPOS, 1)).toEqual({ gold: 50, essence: 1 });
    expect(firstClearCurrency(CAMPOS, 5)).toEqual({ gold: 250, essence: 2 });
    expect(firstClearCurrency(CAMPOS, 10)).toEqual({ gold: 500, essence: 8 });
    expect(firstClearCurrency(REGIONS['desfiladeiro-dos-trovoes']!, 4)).toEqual({
      gold: 600,
      essence: 3,
    });
  });
});

describe('conclusão de wave', () => {
  it('conclui após exatamente 15 vitórias; derrotas não contam', () => {
    const r = settle(initialWaveProgress('farm', 1, 0), hero({ classId: 'guardian' }), 3 * HOUR);
    const events = clears(r);
    expect(events.length).toBeGreaterThan(5);
    for (const e of events) expect(e.totals.wins).toBe(15);
    expect(r.progress.wins).toBe(r.wins - 15 * events.length);
    expect(events.reduce((s, e) => s + e.totals.losses, 0) + r.progress.losses).toBe(
      r.losses + r.timeouts,
    );
  });

  it('a posição na wave só avança com vitórias', () => {
    // Wave 4 (monstros +12%) com um herói nível 1: perde com frequência.
    const r = settle(initialWaveProgress('farm', 4, 3), WEAK, 6 * MIN);
    expect(r.recent.length).toBe(r.encounters);
    const failures = r.recent.filter((e) => e.outcome !== 'win');
    expect(failures.length).toBeGreaterThan(0);
    for (let i = 1; i < r.recent.length; i += 1) {
      const prev = r.recent[i - 1]!;
      const cur = r.recent[i]!;
      const expected = prev.waveCleared ? 1 : prev.waveWinsAfter + 1;
      expect(cur.position).toBe(expected);
      if (cur.outcome !== 'win') expect(cur.waveWinsAfter).toBe(cur.position - 1);
    }
  });

  it('modo Avançar segue para a próxima wave automaticamente', () => {
    const r = settle(initialWaveProgress('advance', 1, 0), STRONG, 2 * HOUR);
    const events = clears(r);
    expect(events.length).toBeGreaterThanOrEqual(3);
    // Avança uma wave por conclusão até a 10 (limite de conteúdo), depois farma a 10.
    events.forEach((e, i) => {
      expect(e.wave).toBe(Math.min(i + 1, 10));
      expect(e.firstClear).toBe(i < 10);
      if (e.wave < 10)
        expect(e.next).toEqual({ mode: 'advance', wave: e.wave + 1, reason: 'advance' });
    });
    expect(r.progress.highestCleared).toBe(Math.min(events.length, 10));
  });

  it('modo Farmar repete a mesma wave sem recompensas de primeira conclusão', () => {
    const r = settle(initialWaveProgress('farm', 2, 3), STRONG, 2 * HOUR);
    const events = clears(r);
    expect(events.length).toBeGreaterThan(2);
    for (const e of events) {
      expect(e.wave).toBe(2);
      expect(e.firstClear).toBe(false);
      expect(e.firstClearReward).toBeNull();
      expect(e.next).toEqual({ mode: 'farm', wave: 2, reason: 'repeat' });
    }
    expect(r.firstClears).toBe(0);
    expect(r.firstClearGold + r.firstClearEssence + r.firstClearItems.length).toBe(0);
    expect(r.progress).toMatchObject({ mode: 'farm', wave: 2, highestCleared: 3 });
  });

  it('a primeira conclusão paga uma única vez, mesmo farmando a wave que acabou de liberar', () => {
    const r = settle(initialWaveProgress('farm', 1, 0), STRONG, HOUR);
    const events = clears(r);
    expect(events.filter((e) => e.firstClear)).toHaveLength(1);
    expect(events[0]!.firstClear).toBe(true);
    expect(r.firstClearGold).toBe(50);
    expect(r.firstClearEssence).toBe(1);
  });

  it('recompensas normais continuam vindo dos monstros ao repetir uma wave', () => {
    const first = settle(initialWaveProgress('farm', 2, 0), STRONG, HOUR);
    const again = settle(initialWaveProgress('farm', 2, 2), STRONG, HOUR);
    expect(again.gold).toBe(first.gold);
    expect(again.xpGained).toBe(first.xpGained);
    expect(again.drops).toEqual(first.drops);
    expect(again.firstClearGold).toBe(0);
    expect(first.firstClearGold).toBe(100);
  });
});

describe('elite e chefe', () => {
  it('o elite ocupa a 15ª vitória da wave 5 e concede item raro na primeira conclusão', () => {
    const progress = { ...initialWaveProgress('advance', 5, 4), wins: 14 };
    const r = settle(progress, STRONG, 45_000);
    expect(r.recent.length).toBe(r.encounters);
    const first = r.recent[0]!;
    expect(first).toMatchObject({
      kind: 'elite',
      monsterId: 'lobo-cometa-ancestral',
      position: 15,
    });
    expect(first.outcome).toBe('win');
    const event = clears(r)[0]!;
    expect(event).toMatchObject({ wave: 5, kind: 'elite', firstClear: true });
    expect(event.firstClearReward!.item!.rarity).toBe('rare');
    expect(event.next).toEqual({ mode: 'advance', wave: 6, reason: 'advance' });
  });

  it('o chefe ocupa a 15ª vitória da wave 10; vencê-lo concede item épico e atinge o limite', () => {
    const progress = { ...initialWaveProgress('advance', 10, 9), wins: 14 };
    const r = settle(progress, STRONG, 30 * MIN);
    const boss = settle(progress, STRONG, 2 * MIN).recent[0];
    expect(boss).toMatchObject({
      kind: 'boss',
      monsterId: 'colosso-do-eclipse-menor',
      outcome: 'win',
    });
    const event = clears(r)[0]!;
    expect(event).toMatchObject({ wave: 10, kind: 'boss', firstClear: true });
    expect(event.firstClearReward).toMatchObject({ gold: 500, essence: 8 });
    expect(event.firstClearReward!.item!.rarity).toBe('epic');
    // Fim do conteúdo implementado: passa a farmar a última wave e avisa.
    expect(event.next).toEqual({ mode: 'farm', wave: 10, reason: 'content_limit' });
    expect(r.progress.notice).toEqual({ type: 'content_limit', wave: 10 });
    expect(
      clears(r)
        .slice(1)
        .every((e) => e.wave === 10 && !e.firstClear),
    ).toBe(true);
  });

  it('derrota contra o especial não conta: o especial se repete', () => {
    const progress = { ...initialWaveProgress('farm', 5, 4), wins: 14 };
    const r = settle(progress, WEAK, 15 * MIN);
    const attempts = r.recent.filter((e) => e.kind === 'elite');
    expect(attempts.length).toBeGreaterThan(2);
    for (const e of attempts) {
      expect(e.position).toBe(15);
      if (e.outcome !== 'win') expect(e.waveWinsAfter).toBe(14);
    }
    expect(r.wavesCleared).toBe(attempts.some((e) => e.outcome === 'win') ? 1 : 0);
  });

  it('no modo Avançar, 3 falhas seguidas recuam para farmar a wave anterior', () => {
    const progress = { ...initialWaveProgress('advance', 5, 4), wins: 14 };
    const r = settle(progress, WEAK, 5 * MIN);
    expect(r.recent.length).toBe(r.encounters);
    const retreat = r.waveEvents.find((e) => e.type === 'retreat');
    expect(retreat).toMatchObject({ type: 'retreat', fromWave: 5, toWave: 4 });
    const atRetreat = r.recent.findIndex((e) => e.index === retreat!.encounterIndex);
    expect(r.recent.slice(atRetreat - 2, atRetreat + 1).every((e) => e.outcome !== 'win')).toBe(
      true,
    );
    expect(r.recent[atRetreat + 1]).toMatchObject({ wave: 4, mode: 'farm', position: 1 });
  });

  it('no modo Farmar não há recuo automático', () => {
    const progress = { ...initialWaveProgress('farm', 5, 4), wins: 14 };
    const r = settle(progress, WEAK, 15 * MIN);
    expect(r.waveEvents.some((e) => e.type === 'retreat')).toBe(false);
    expect(r.progress.wave).toBe(5);
  });

  it('o recuo não acontece na wave 1 (não há para onde recuar)', () => {
    const r = settle(initialWaveProgress('advance', 1, 0), WEAK, 3 * HOUR);
    expect(r.waveEvents.some((e) => e.type === 'retreat')).toBe(false);
  });
});

describe('requisito de nível', () => {
  it('Avançar espera o nível da próxima wave repetindo a atual', () => {
    const r = settle(initialWaveProgress('advance', 4, 3), hero({ level: 2 }), 3 * HOUR);
    const events = clears(r);
    const gated = events.find((e) => e.next.reason === 'level_gate');
    expect(gated).toMatchObject({ wave: 4, next: { mode: 'advance', wave: 4 } });
    // Ao alcançar o nível 3, a próxima conclusão avança para a wave 5.
    const advanced = events.find((e) => e.next.reason === 'advance');
    expect(advanced).toMatchObject({ wave: 4, next: { wave: 5 } });
    const gatedIndex = events.indexOf(gated!);
    expect(
      events
        .slice(gatedIndex + 1)
        .filter((e) => e.wave === 4)
        .every((e) => !e.firstClear),
    ).toBe(true);
  });
});

describe('liquidação offline e determinismo com waves', () => {
  it('atravessa várias waves offline respeitando o teto de 8 horas', () => {
    const r = settle(initialWaveProgress('advance', 1, 0), STRONG, 30 * HOUR);
    expect(r.forfeitedMs).toBe(22 * HOUR);
    expect(r.windowEndMs - r.windowStartMs).toBeLessThanOrEqual(OFFLINE_CAP_MS);
    expect(r.wavesCleared).toBeGreaterThan(10);
    expect(r.progress.highestCleared).toBe(10);
    for (const e of r.waveEvents) expect(e.atMs).toBeGreaterThanOrEqual(r.windowStartMs);
    const exactly8h = settleHunt({
      regionId: CAMPOS.id,
      seed: 4242,
      nextEncounter: 0,
      lastSettledAtMs: T0 + 22 * HOUR,
      nowMs: T0 + 30 * HOUR,
      character: STRONG,
      progress: initialWaveProgress('advance', 1, 0),
    });
    expect(r.progress).toEqual(exactly8h.progress);
    expect(r.firstClearGold).toBe(exactly8h.firstClearGold);
  });

  it('liquidação única e particionada produzem o mesmo resultado (inclusive waves)', () => {
    const character = hero({ classId: 'arcanist', affinity: 'storm', level: 3 });
    const start = initialWaveProgress('advance', 3, 2);
    const total = 4 * HOUR;
    const once = settleHunt({
      regionId: CAMPOS.id,
      seed: 777,
      nextEncounter: 0,
      lastSettledAtMs: T0,
      nowMs: T0 + total,
      character,
      progress: start,
    });

    let state = { next: 0, last: T0, level: character.level, xp: character.xp, progress: start };
    const acc = {
      gold: 0,
      essence: 0,
      fcGold: 0,
      fcEssence: 0,
      events: [] as unknown[],
      drops: [] as unknown[],
      fcItems: [] as unknown[],
    };
    for (let now = T0 + 777; now <= T0 + total; now += 123_457) {
      const r = settleHunt({
        regionId: CAMPOS.id,
        seed: 777,
        nextEncounter: state.next,
        lastSettledAtMs: state.last,
        nowMs: now,
        character: { ...character, level: state.level, xp: state.xp },
        progress: state.progress,
      });
      state = {
        next: r.nextEncounter,
        last: r.windowEndMs,
        level: r.level,
        xp: r.xp,
        progress: r.progress,
      };
      acc.gold += r.gold;
      acc.essence += r.essence;
      acc.fcGold += r.firstClearGold;
      acc.fcEssence += r.firstClearEssence;
      acc.events.push(...r.waveEvents);
      acc.drops.push(...r.drops);
      acc.fcItems.push(...r.firstClearItems);
    }
    const tail = settleHunt({
      regionId: CAMPOS.id,
      seed: 777,
      nextEncounter: state.next,
      lastSettledAtMs: state.last,
      nowMs: T0 + total,
      character: { ...character, level: state.level, xp: state.xp },
      progress: state.progress,
    });

    expect(once.wavesCleared).toBeGreaterThan(3);
    expect(tail.progress).toEqual(once.progress);
    expect(tail.nextEncounter).toBe(once.nextEncounter);
    expect(tail.level).toBe(once.level);
    expect(tail.xp).toBe(once.xp);
    expect(acc.gold + tail.gold).toBe(once.gold);
    expect(acc.essence + tail.essence).toBe(once.essence);
    expect(acc.fcGold + tail.firstClearGold).toBe(once.firstClearGold);
    expect(acc.fcEssence + tail.firstClearEssence).toBe(once.firstClearEssence);
    expect([...acc.events, ...tail.waveEvents]).toEqual(once.waveEvents);
    expect([...acc.drops, ...tail.drops]).toEqual(once.drops);
    expect([...acc.fcItems, ...tail.firstClearItems]).toEqual(once.firstClearItems);
  });

  it('mesma sequência de comandos e tempos ⇒ mesmo resultado, com qualquer número de consultas', () => {
    const character = STRONG;
    const commandAt = T0 + 37 * MIN;
    const end = T0 + 90 * MIN;

    // Simula o servidor: liquida até o instante do comando, aplica-o e move o cursor
    // para esse instante (o encontro em andamento é descartado); depois segue.
    function run(syncEveryMs: number) {
      let state = {
        next: 0,
        last: T0,
        level: character.level,
        xp: 0,
        progress: initialWaveProgress('advance', 1, 0),
      };
      let gold = 0;
      let fc = 0;
      const step = (now: number) => {
        const r = settleHunt({
          regionId: CAMPOS.id,
          seed: 99,
          nextEncounter: state.next,
          lastSettledAtMs: state.last,
          nowMs: now,
          character: { ...character, level: state.level, xp: state.xp },
          progress: state.progress,
        });
        state = {
          next: r.nextEncounter,
          last: r.windowEndMs,
          level: r.level,
          xp: r.xp,
          progress: r.progress,
        };
        gold += r.gold;
        fc += r.firstClearGold;
      };
      for (let t = T0 + syncEveryMs; t < commandAt; t += syncEveryMs) step(t);
      step(commandAt);
      const target = Math.max(1, state.progress.highestCleared);
      state.progress = applyWaveSettings(
        CAMPOS,
        state.progress,
        { mode: 'farm', wave: target },
        state.level,
      ).progress;
      state.last = commandAt;
      for (let t = commandAt + syncEveryMs; t < end; t += syncEveryMs) step(t);
      step(end);
      return { state, gold, fc };
    }

    const rare = run(60 * MIN);
    const frequent = run(17_000);
    expect(frequent.state).toEqual(rare.state);
    expect(frequent.gold).toBe(rare.gold);
    expect(frequent.fc).toBe(rare.fc);
    expect(rare.state.progress.mode).toBe('farm');
  });

  it('o modo não influencia o resultado de um encontro (alternar não rerrola nada)', () => {
    const stats = computeCombatStats(STRONG);
    for (let index = 0; index < 50; index += 1) {
      const base = {
        region: CAMPOS,
        seed: 5,
        index,
        startedAtMs: 0,
        stats,
        character: STRONG,
        recordEvents: false,
        wave: 3,
        position: 7,
      };
      const advance = resolveEncounter({ ...base, mode: 'advance' }).summary;
      const farm = resolveEncounter({ ...base, mode: 'farm' }).summary;
      expect({ ...farm, mode: 'advance' }).toEqual(advance);
    }
  });
});

describe('comandos de wave', () => {
  const at3 = { ...initialWaveProgress('advance', 3, 4), wins: 9, losses: 2, failStreak: 2 };

  it('alternar o modo mantém a wave e as vitórias já obtidas', () => {
    const { progress, changed } = applyWaveSettings(CAMPOS, at3, { mode: 'farm' }, 5);
    expect(changed).toBe(true);
    expect(progress).toMatchObject({
      mode: 'farm',
      wave: 3,
      wins: 9,
      losses: 2,
      failStreak: 0,
      highestCleared: 4,
    });
  });

  it('trocar de wave recomeça a contagem; pedido igual não muda nada', () => {
    expect(applyWaveSettings(CAMPOS, at3, { wave: 5 }, 5).progress).toMatchObject({
      wave: 5,
      wins: 0,
      mode: 'advance',
    });
    expect(applyWaveSettings(CAMPOS, at3, { mode: 'advance', wave: 3 }, 5)).toEqual({
      progress: at3,
      changed: false,
    });
  });

  it('recusa waves bloqueadas, por nível ou inexistentes', () => {
    expect(() => applyWaveSettings(CAMPOS, at3, { wave: 6 }, 9)).toThrow(WaveSelectionError);
    try {
      applyWaveSettings(CAMPOS, at3, { wave: 5 }, 2);
    } catch (e) {
      expect(e).toMatchObject({ reason: 'level', minLevel: 3 });
    }
    expect(() => applyWaveSettings(CAMPOS, at3, { wave: 11 }, 30)).toThrow(/invalid/);
  });

  it('trocar o modo limpa avisos automáticos', () => {
    const withNotice = { ...at3, notice: { type: 'retreat' as const, fromWave: 4, toWave: 3 } };
    expect(applyWaveSettings(CAMPOS, withNotice, { mode: 'farm' }, 5).progress.notice).toBeNull();
  });
});
