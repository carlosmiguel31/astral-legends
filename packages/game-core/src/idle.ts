/**
 * Liquidação determinística da caça idle.
 *
 * Uma caça é uma sequência infinita de encontros numerados (0, 1, 2, …). O resultado do
 * encontro `n` depende apenas de: semente da caça, `n`, região e estado do personagem
 * naquele momento (nível e equipamento). Por isso liquidar 1 vez ou 100 vezes o mesmo
 * intervalo produz exatamente o mesmo resultado — a frequência das consultas não importa.
 *
 * Linha do tempo de um encontro:  [procura] → [combate] → [recuperação]
 * Um encontro só é resolvido quando termina inteiramente antes de `nowMs`; o tempo de
 * um encontro em andamento fica para a próxima liquidação.
 */

import { MONSTERS, type MonsterDefinition } from './content/monsters.js';
import { REGIONS, isRegionUnlocked, type RegionDefinition } from './content/regions.js';
import { simulateCombat, type AttackEvent } from './combat.js';
import { assertNonNegativeInt, assertSafeInt } from './imath.js';
import { pickWeighted, rollItemBonuses, rollRarity, type ItemDrop } from './loot.js';
import { applyXp, xpForKill } from './progression.js';
import { createRng, deriveSeed } from './rng.js';
import { computeCombatStats, type EquippedItem } from './stats.js';
import type { AffinityId, ClassId, CombatStats } from './types.js';

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
const STREAM = { spawn: 0, combat: 1, rewards: 2 } as const;

export interface HuntCharacter {
  classId: ClassId;
  affinity: AffinityId;
  level: number;
  /** XP dentro do nível atual. */
  xp: number;
  equipment: readonly EquippedItem[];
}

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
  events?: AttackEvent[];
}

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
  gold: number;
  essence: number;
  drops: ItemDrop[];
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

function getMonster(monsterId: string): MonsterDefinition {
  const monster = MONSTERS[monsterId];
  if (!monster) throw new Error(`monstro inexistente: ${monsterId}`);
  return monster;
}

interface ResolvedEncounter {
  summary: EncounterSummary;
}

/**
 * Resolve um único encontro. Função pura: mesmo `n`, semente, região e personagem
 * produzem sempre o mesmo resultado.
 */
export function resolveEncounter(params: {
  region: RegionDefinition;
  seed: number;
  index: number;
  startedAtMs: number;
  stats: CombatStats;
  character: HuntCharacter;
  recordEvents: boolean;
}): ResolvedEncounter {
  const { region, seed, index, startedAtMs, stats, character } = params;

  const spawnRng = createRng(deriveSeed(seed, index, STREAM.spawn));
  const monster = getMonster(pickWeighted(region.spawns, spawnRng).monsterId);

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
  };
  if (combat.events) summary.events = combat.events;
  return { summary };
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

  for (let i = 0; i < MAX_ENCOUNTERS_PER_SETTLEMENT; i += 1) {
    const { summary } = resolveEncounter({
      region,
      seed: input.seed,
      index,
      startedAtMs: cursor,
      stats,
      character,
      recordEvents: false,
    });
    if (summary.endedAtMs > input.nowMs) break;

    if (summary.outcome === 'win') wins += 1;
    else if (summary.outcome === 'loss') losses += 1;
    else timeouts += 1;

    if (summary.xp > 0) {
      const gained = applyXp({ level: character.level, xp: character.xp }, summary.xp);
      xpGained += summary.xp - gained.xpDiscarded;
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
    recent,
  };
}
