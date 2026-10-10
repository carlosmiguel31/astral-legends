/**
 * Liquidação determinística da caça idle, com waves (Fase 2A).
 *
 * Uma caça é uma sequência infinita de encontros numerados (0, 1, 2, …). O resultado do
 * encontro `n` depende apenas de: semente da caça, `n`, região, estado da wave antes do
 * encontro (wave e posição) e estado do personagem (nível e equipamento). O estado da wave
 * é, por sua vez, consequência determinística dos encontros anteriores. Por isso liquidar
 * 1 vez ou 100 vezes o mesmo intervalo produz exatamente o mesmo resultado.
 *
 * Linha do tempo de um encontro:  [procura] → [combate] → [recuperação]
 * Um encontro só é resolvido quando termina inteiramente antes de `nowMs`; o tempo de
 * um encontro em andamento fica para a próxima liquidação.
 *
 * Waves: cada wave exige `WAVE_RULES.winsPerWave` vitórias. Em waves de elite/chefe o
 * último encontro (a 15ª vitória) é o especial. Derrotas não contam.
 *  - Avançar: ao concluir, segue para a próxima wave (respeitando nível e conteúdo).
 *  - Farmar: ao concluir, repete a mesma wave.
 * Recompensas de primeira conclusão só existem quando a wave supera `highestCleared`.
 */

import { MONSTERS, type MonsterDefinition } from './content/monsters.js';
import { REGIONS, isRegionUnlocked, type RegionDefinition } from './content/regions.js';
import {
  WAVE_RULES,
  encounterKind,
  firstClearCurrency,
  firstClearItemRarity,
  scaledMonster,
  waveCount,
  waveMinLevel,
  type HuntMode,
  type WaveKind,
} from './content/waves.js';
import { simulateCombat, type AttackEvent } from './combat.js';
import { assertNonNegativeInt, assertSafeInt } from './imath.js';
import { pickWeighted, rollItemBonuses, rollRarity, type ItemDrop } from './loot.js';
import { applyXp, xpForKill } from './progression.js';
import { createRng, deriveSeed } from './rng.js';
import { computeCombatStats, type EquippedItem, type ItemBonuses } from './stats.js';
import type { AffinityId, ClassId, CombatStats, Rarity } from './types.js';

/** Teto de progresso acumulado sem liquidar (8 h). */
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1_000;
/** Tempo entre um encontro e o próximo. Também é a duração mínima de um encontro. */
export const SEARCH_MS = 3_000;
/** Recuperação após vitória: 0,1 s por ponto de vida perdido. */
export const RECOVERY_MS_PER_HP = 100;
/** Penalidade de derrota: tempo recuperando, sem recompensa. */
export const DEFEAT_RECOVERY_MS = 30_000;
/** Após fuga por tempo limite. */
export const TIMEOUT_RECOVERY_MS = 10_000;
/**
 * Máximo de encontros por liquidação. Como cada encontro dura ≥ SEARCH_MS,
 * 8 h cabem em 9 600 encontros: uma chamada sempre cobre a janela inteira.
 */
export const MAX_ENCOUNTERS_PER_SETTLEMENT = 20_000;
/** Encontros mais recentes devolvidos em detalhe (histórico e animação). */
export const RECENT_ENCOUNTERS = 20;

/** Sub-sementes independentes por encontro. Mudar estes valores invalida replays. */
const STREAM = { spawn: 0, combat: 1, rewards: 2, firstClear: 3 } as const;

export interface HuntCharacter {
  classId: ClassId;
  affinity: AffinityId;
  level: number;
  /** XP dentro do nível atual. */
  xp: number;
  equipment: readonly EquippedItem[];
}

/** Aviso persistido para o jogador sobre uma mudança automática de wave. */
export type WaveNotice =
  | { type: 'retreat'; fromWave: number; toWave: number }
  | { type: 'content_limit'; wave: number }
  | { type: 'level_gate'; wave: number; nextWave: number; minLevel: number };

/** Estado da wave de uma região para um personagem. Inteiros em todos os campos. */
export interface WaveProgress {
  mode: HuntMode;
  wave: number;
  /** Vitórias já obtidas na wave atual (0 .. winsPerWave-1). */
  wins: number;
  /** Encontros não vencidos na wave atual. */
  losses: number;
  /** Falhas consecutivas (derrota ou fuga) — base do recuo automático no modo Avançar. */
  failStreak: number;
  /** Recompensas acumuladas na tentativa atual da wave (para o resumo de conclusão). */
  xp: number;
  gold: number;
  essence: number;
  items: number;
  /** Maior wave já concluída nesta região (0 = nenhuma). */
  highestCleared: number;
  notice: WaveNotice | null;
}

export function initialWaveProgress(
  mode: HuntMode,
  wave: number,
  highestCleared: number,
  notice: WaveNotice | null = null,
): WaveProgress {
  return {
    mode,
    wave,
    wins: 0,
    losses: 0,
    failStreak: 0,
    xp: 0,
    gold: 0,
    essence: 0,
    items: 0,
    highestCleared,
    notice,
  };
}

/**
 * Sem estado de wave informado, a liquidação usa "Farmar wave 1": mesmos monstros e
 * recompensas da Fase 1. Isso mantém válidas as caçadas iniciadas antes das waves.
 */
export const LEGACY_WAVE_PROGRESS: WaveProgress = initialWaveProgress('farm', 1, 0);

export interface SettleHuntInput {
  regionId: string;
  /** Semente uint32 da caça. */
  seed: number;
  /** Índice do próximo encontro a resolver. */
  nextEncounter: number;
  /** Instante em que terminou o último encontro liquidado (epoch ms). */
  lastSettledAtMs: number;
  nowMs: number;
  character: HuntCharacter;
  /** Estado da wave antes do primeiro encontro desta liquidação. */
  progress?: WaveProgress;
  /** Quantos dos encontros mais recentes devem trazer os golpes individuais. */
  includeEventsForLast?: number;
  offlineCapMs?: number;
}

export type EncounterOutcome = 'win' | 'loss' | 'timeout';

export interface EncounterSummary {
  index: number;
  monsterId: string;
  monsterLevel: number;
  outcome: EncounterOutcome;
  startedAtMs: number;
  /** Início do combate (após a procura). */
  combatStartMs: number;
  combatMs: number;
  endedAtMs: number;
  playerMaxHp: number;
  monsterMaxHp: number;
  damageDealt: number;
  damageTaken: number;
  xp: number;
  gold: number;
  essence: number;
  drop: ItemDrop | null;
  /** Nível no início do encontro (determina os atributos usados no combate). */
  levelBefore: number;
  levelAfter: number;
  levelUp: boolean;
  /** Wave, modo e posição (1 = primeira vitória) no início do encontro. */
  wave: number;
  mode: HuntMode;
  position: number;
  kind: WaveKind;
  /** Vitórias na wave depois do encontro (0 quando a wave foi concluída). */
  waveWinsAfter: number;
  waveCleared: boolean;
  firstClear: boolean;
  events?: AttackEvent[];
}

export interface FirstClearItem {
  wave: number;
  defId: string;
  rarity: Rarity;
  bonuses: ItemBonuses;
}

export interface WaveClearEvent {
  type: 'clear';
  wave: number;
  kind: WaveKind;
  mode: HuntMode;
  encounterIndex: number;
  atMs: number;
  firstClear: boolean;
  totals: {
    wins: number;
    losses: number;
    xp: number;
    gold: number;
    essence: number;
    items: number;
  };
  firstClearReward: { gold: number; essence: number; item: FirstClearItem | null } | null;
  next: {
    mode: HuntMode;
    wave: number;
    reason: 'advance' | 'repeat' | 'level_gate' | 'content_limit';
  };
}

export interface WaveRetreatEvent {
  type: 'retreat';
  fromWave: number;
  toWave: number;
  encounterIndex: number;
  atMs: number;
}

export type WaveEvent = WaveClearEvent | WaveRetreatEvent;

export interface SettleHuntResult {
  fromEncounter: number;
  /** Próximo encontro a resolver (exclusivo). */
  nextEncounter: number;
  encounters: number;
  /** Início efetivo da janela (após aplicar o teto offline). */
  windowStartMs: number;
  /** Novo `lastSettledAt`: fim do último encontro resolvido. */
  windowEndMs: number;
  /** Tempo descartado por exceder o teto offline. */
  forfeitedMs: number;
  wins: number;
  losses: number;
  timeouts: number;
  levelBefore: number;
  level: number;
  xp: number;
  xpGained: number;
  xpDiscarded: number;
  /** Ouro e essência dos monstros derrotados. */
  gold: number;
  essence: number;
  drops: ItemDrop[];
  /** Estado da wave antes e depois da liquidação. */
  progressBefore: WaveProgress;
  progress: WaveProgress;
  waveEvents: WaveEvent[];
  wavesCleared: number;
  /** Recompensas exclusivas de primeira conclusão (separadas das recompensas normais). */
  firstClears: number;
  firstClearGold: number;
  firstClearEssence: number;
  firstClearItems: FirstClearItem[];
  recent: EncounterSummary[];
}

export class RegionLockedError extends Error {
  constructor(regionId: string, minLevel: number) {
    super(`região ${regionId} exige nível ${minLevel}`);
    this.name = 'RegionLockedError';
  }
}

function getRegion(regionId: string): RegionDefinition {
  const region = REGIONS[regionId];
  if (!region) throw new Error(`região inexistente: ${regionId}`);
  return region;
}

function getMonster(monsterId: string | null): MonsterDefinition {
  const monster = monsterId ? MONSTERS[monsterId] : undefined;
  if (!monster) throw new Error(`monstro inexistente: ${monsterId}`);
  return monster;
}

export function validateWaveProgress(region: RegionDefinition, p: WaveProgress): void {
  for (const key of [
    'wave',
    'wins',
    'losses',
    'failStreak',
    'xp',
    'gold',
    'essence',
    'items',
    'highestCleared',
  ] as const) {
    assertNonNegativeInt(p[key], `progress.${key}`);
  }
  if (p.mode !== 'advance' && p.mode !== 'farm') throw new RangeError('modo inválido');
  if (p.wave < 1 || p.wave > waveCount(region))
    throw new RangeError(`wave fora do conteúdo: ${p.wave}`);
  if (p.wins >= WAVE_RULES.winsPerWave) throw new RangeError('vitórias na wave acima do limite');
  if (p.highestCleared > waveCount(region))
    throw new RangeError('highestCleared acima do conteúdo');
}

interface ResolvedEncounter {
  summary: EncounterSummary;
}

/**
 * Resolve um único encontro. Função pura: mesmo `n`, semente, região, wave/posição e
 * personagem produzem sempre o mesmo resultado.
 */
export function resolveEncounter(params: {
  region: RegionDefinition;
  seed: number;
  index: number;
  startedAtMs: number;
  stats: CombatStats;
  character: HuntCharacter;
  recordEvents: boolean;
  /** Contexto da wave (padrão: wave 1, primeira posição, modo farmar). */
  wave?: number;
  position?: number;
  mode?: HuntMode;
}): ResolvedEncounter {
  const { region, seed, index, startedAtMs, stats, character } = params;
  const wave = params.wave ?? 1;
  const position = params.position ?? 1;
  const kind = encounterKind(wave, position - 1);

  let monster: MonsterDefinition;
  if (kind === 'boss') monster = getMonster(region.bossId);
  else if (kind === 'elite') monster = getMonster(region.waves.eliteId);
  else {
    const spawnRng = createRng(deriveSeed(seed, index, STREAM.spawn));
    monster = scaledMonster(getMonster(pickWeighted(region.spawns, spawnRng).monsterId), wave);
  }

  const combat = simulateCombat({
    player: { stats, affinity: character.affinity },
    monster: { stats: monster.stats, affinity: monster.affinity },
    seed: deriveSeed(seed, index, STREAM.combat),
    recordEvents: params.recordEvents,
  });

  const outcome: EncounterOutcome =
    combat.winner === 'player' ? 'win' : combat.winner === 'monster' ? 'loss' : 'timeout';

  let xp = 0;
  let gold = 0;
  let essence = 0;
  let drop: ItemDrop | null = null;
  let recoveryMs: number;

  if (outcome === 'win') {
    // Ordem fixa de consumo: ouro, essência, chance de item, [item, raridade, bônus].
    const rewardRng = createRng(deriveSeed(seed, index, STREAM.rewards));
    xp = xpForKill(monster.rewards.xp, character.level, monster.level);
    gold = rewardRng.int(monster.rewards.goldMin, monster.rewards.goldMax);
    essence = rewardRng.chanceBp(monster.rewards.essenceChanceBp) ? 1 : 0;
    if (rewardRng.chanceBp(monster.rewards.itemDropChanceBp) && region.loot.length > 0) {
      const defId = pickWeighted(region.loot, rewardRng).itemId;
      const rarity = rollRarity(rewardRng);
      drop = {
        encounterIndex: index,
        defId,
        rarity,
        bonuses: rollItemBonuses(defId, rarity, rewardRng),
      };
    }
    recoveryMs = (stats.maxHp - combat.playerHp) * RECOVERY_MS_PER_HP;
  } else if (outcome === 'loss') {
    recoveryMs = DEFEAT_RECOVERY_MS;
  } else {
    recoveryMs = TIMEOUT_RECOVERY_MS;
  }

  const combatStartMs = startedAtMs + SEARCH_MS;
  const endedAtMs = combatStartMs + combat.durationMs + recoveryMs;

  const summary: EncounterSummary = {
    index,
    monsterId: monster.id,
    monsterLevel: monster.level,
    outcome,
    startedAtMs,
    combatStartMs,
    combatMs: combat.durationMs,
    endedAtMs,
    playerMaxHp: stats.maxHp,
    monsterMaxHp: monster.stats.maxHp,
    damageDealt: combat.playerDamageDealt,
    damageTaken: combat.monsterDamageDealt,
    xp,
    gold,
    essence,
    drop,
    levelBefore: character.level,
    levelAfter: character.level,
    levelUp: false,
    wave,
    mode: params.mode ?? 'farm',
    position,
    kind,
    waveWinsAfter: position - 1 + (outcome === 'win' ? 1 : 0),
    waveCleared: false,
    firstClear: false,
  };
  if (combat.events) summary.events = combat.events;
  return { summary };
}

/** Recompensa de primeira conclusão. Usa um fluxo de RNG próprio do encontro que concluiu. */
function firstClearReward(
  region: RegionDefinition,
  wave: number,
  seed: number,
  index: number,
): NonNullable<WaveClearEvent['firstClearReward']> {
  const { gold, essence } = firstClearCurrency(region, wave);
  const rarity = firstClearItemRarity(wave);
  let item: FirstClearItem | null = null;
  if (rarity && region.loot.length > 0) {
    const rng = createRng(deriveSeed(seed, index, STREAM.firstClear));
    const defId = pickWeighted(region.loot, rng).itemId;
    item = { wave, defId, rarity, bonuses: rollItemBonuses(defId, rarity, rng) };
  }
  return { gold, essence, item };
}

/**
 * Liquida todos os encontros que terminaram entre `lastSettledAtMs` e `nowMs`,
 * respeitando o teto offline. Não muta a entrada.
 */
export function settleHunt(input: SettleHuntInput): SettleHuntResult {
  const region = getRegion(input.regionId);
  const capMs = input.offlineCapMs ?? OFFLINE_CAP_MS;
  assertNonNegativeInt(input.nextEncounter, 'nextEncounter');
  assertSafeInt(input.lastSettledAtMs, 'lastSettledAtMs');
  assertSafeInt(input.nowMs, 'nowMs');
  assertNonNegativeInt(capMs, 'offlineCapMs');

  const levelBefore = input.character.level;
  if (!isRegionUnlocked(region, levelBefore))
    throw new RegionLockedError(region.id, region.minLevel);

  const progressBefore: WaveProgress = { ...(input.progress ?? LEGACY_WAVE_PROGRESS) };
  validateWaveProgress(region, progressBefore);
  const progress: WaveProgress = { ...progressBefore };

  // Teto offline: o que passar de `capMs` é descartado.
  const windowStartMs = Math.max(input.lastSettledAtMs, input.nowMs - capMs);
  const forfeitedMs = windowStartMs - input.lastSettledAtMs;
  const includeEvents = input.includeEventsForLast ?? 0;

  const character: HuntCharacter = { ...input.character };
  let stats = computeCombatStats(character);
  let cursor = windowStartMs;
  let index = input.nextEncounter;
  let wins = 0;
  let losses = 0;
  let timeouts = 0;
  let xpGained = 0;
  let xpDiscarded = 0;
  let gold = 0;
  let essence = 0;
  const drops: ItemDrop[] = [];
  const recent: EncounterSummary[] = [];
  const waveEvents: WaveEvent[] = [];
  let wavesCleared = 0;
  let firstClears = 0;
  let firstClearGold = 0;
  let firstClearEssence = 0;
  const firstClearItems: FirstClearItem[] = [];

  for (let i = 0; i < MAX_ENCOUNTERS_PER_SETTLEMENT; i += 1) {
    const { summary } = resolveEncounter({
      region,
      seed: input.seed,
      index,
      startedAtMs: cursor,
      stats,
      character,
      recordEvents: false,
      wave: progress.wave,
      position: progress.wins + 1,
      mode: progress.mode,
    });
    if (summary.endedAtMs > input.nowMs) break;

    if (summary.outcome === 'win') wins += 1;
    else if (summary.outcome === 'loss') losses += 1;
    else timeouts += 1;

    let xpThisEncounter = 0;
    if (summary.xp > 0) {
      const gained = applyXp({ level: character.level, xp: character.xp }, summary.xp);
      xpThisEncounter = summary.xp - gained.xpDiscarded;
      xpGained += xpThisEncounter;
      xpDiscarded += gained.xpDiscarded;
      if (gained.levelsGained > 0) {
        summary.levelUp = true;
        character.level = gained.level;
        stats = computeCombatStats(character);
      }
      character.xp = gained.xp;
    }
    summary.levelAfter = character.level;
    gold += summary.gold;
    essence += summary.essence;
    if (summary.drop) drops.push(summary.drop);

    // ── Progresso da wave ──────────────────────────────────────────────────
    progress.xp += xpThisEncounter;
    progress.gold += summary.gold;
    progress.essence += summary.essence;
    if (summary.drop) progress.items += 1;

    if (summary.outcome === 'win') {
      progress.wins += 1;
      progress.failStreak = 0;
    } else {
      progress.losses += 1;
      progress.failStreak += 1;
    }

    if (progress.wins === WAVE_RULES.winsPerWave) {
      const wave = progress.wave;
      const firstClear = wave > progress.highestCleared;
      const reward = firstClear ? firstClearReward(region, wave, input.seed, index) : null;
      if (firstClear) {
        progress.highestCleared = wave;
        firstClears += 1;
        firstClearGold += reward!.gold;
        firstClearEssence += reward!.essence;
        if (reward!.item) firstClearItems.push(reward!.item);
      }

      let next: WaveClearEvent['next'];
      let notice: WaveNotice | null = null;
      if (progress.mode === 'farm') {
        next = { mode: 'farm', wave, reason: 'repeat' };
      } else if (wave >= waveCount(region)) {
        next = { mode: 'farm', wave, reason: 'content_limit' };
        notice = { type: 'content_limit', wave };
      } else if (character.level < waveMinLevel(region, wave + 1)) {
        next = { mode: 'advance', wave, reason: 'level_gate' };
        notice = {
          type: 'level_gate',
          wave,
          nextWave: wave + 1,
          minLevel: waveMinLevel(region, wave + 1),
        };
      } else {
        next = { mode: 'advance', wave: wave + 1, reason: 'advance' };
      }

      waveEvents.push({
        type: 'clear',
        wave,
        kind: summary.kind,
        mode: progress.mode,
        encounterIndex: index,
        atMs: summary.endedAtMs,
        firstClear,
        totals: {
          wins: progress.wins,
          losses: progress.losses,
          xp: progress.xp,
          gold: progress.gold,
          essence: progress.essence,
          items: progress.items,
        },
        firstClearReward: reward,
        next,
      });
      wavesCleared += 1;
      summary.waveCleared = true;
      summary.firstClear = firstClear;
      summary.waveWinsAfter = 0;
      // Um avanço bem-sucedido apaga avisos antigos; repetir em Farmar mantém o atual.
      const keptNotice = next.reason === 'repeat' ? progress.notice : null;
      Object.assign(
        progress,
        initialWaveProgress(next.mode, next.wave, progress.highestCleared, notice ?? keptNotice),
      );
    } else if (
      progress.mode === 'advance' &&
      progress.failStreak >= WAVE_RULES.retreatAfterFailures &&
      progress.wave > 1
    ) {
      // Recuo automático: falhas seguidas no modo Avançar levam a farmar a wave anterior
      // (sempre já concluída). O jogador decide quando tentar avançar de novo.
      const fromWave = progress.wave;
      const toWave = fromWave - 1;
      waveEvents.push({
        type: 'retreat',
        fromWave,
        toWave,
        encounterIndex: index,
        atMs: summary.endedAtMs,
      });
      Object.assign(
        progress,
        initialWaveProgress('farm', toWave, progress.highestCleared, {
          type: 'retreat',
          fromWave,
          toWave,
        }),
      );
    }

    recent.push(summary);
    if (recent.length > RECENT_ENCOUNTERS) recent.shift();

    cursor = summary.endedAtMs;
    index += 1;
  }

  // Golpes individuais só para os últimos encontros (re-simulação determinística, barata).
  if (includeEvents > 0) {
    const replayFrom = Math.max(0, recent.length - includeEvents);
    for (let i = replayFrom; i < recent.length; i += 1) {
      const original = recent[i]!;
      const atStart: HuntCharacter = { ...character, level: original.levelBefore };
      const { summary } = resolveEncounter({
        region,
        seed: input.seed,
        index: original.index,
        startedAtMs: original.startedAtMs,
        stats: computeCombatStats(atStart),
        character: atStart,
        recordEvents: true,
        wave: original.wave,
        position: original.position,
        mode: original.mode,
      });
      if (summary.events) original.events = summary.events;
    }
  }

  return {
    fromEncounter: input.nextEncounter,
    nextEncounter: index,
    encounters: index - input.nextEncounter,
    windowStartMs,
    windowEndMs: cursor,
    forfeitedMs,
    wins,
    losses,
    timeouts,
    levelBefore,
    level: character.level,
    xp: character.xp,
    xpGained,
    xpDiscarded,
    gold,
    essence,
    drops,
    progressBefore,
    progress,
    waveEvents,
    wavesCleared,
    firstClears,
    firstClearGold,
    firstClearEssence,
    firstClearItems,
    recent,
  };
}
