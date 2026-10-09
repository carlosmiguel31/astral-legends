import { affinityMultiplierBp } from './content/affinities.js';
import { BP, applyBp, assertNonNegativeInt, mulDiv } from './imath.js';
import { createRng, type Rng } from './rng.js';
import type { AffinityId, CombatStats } from './types.js';

/** Constante da fórmula de mitigação: dano = ataque · K / (K + defesa). */
export const DEFENSE_K = 100;
export const DAMAGE_VARIANCE_MIN_BP = 9_000;
export const DAMAGE_VARIANCE_MAX_BP = 11_000;
export const DEFAULT_MAX_COMBAT_MS = 120_000;
/** Limite rígido de ações para impedir laços longos mesmo com dados inválidos. */
export const MAX_COMBAT_ACTIONS = 2_000;

export type Side = 'player' | 'monster';

export interface Combatant {
  stats: CombatStats;
  affinity: AffinityId;
  /** Vida no início do combate (padrão: maxHp). */
  hp?: number;
}

export interface AttackEvent {
  atMs: number;
  attacker: Side;
  damage: number;
  crit: boolean;
  targetHpAfter: number;
}

export interface CombatResult {
  winner: Side | 'timeout';
  durationMs: number;
  playerHp: number;
  monsterHp: number;
  playerDamageDealt: number;
  monsterDamageDealt: number;
  actions: number;
  rngDraws: number;
  /** Presente apenas quando `recordEvents` é verdadeiro. */
  events?: AttackEvent[];
}

export interface CombatInput {
  player: Combatant;
  monster: Combatant;
  seed: number;
  maxDurationMs?: number;
  recordEvents?: boolean;
}

export interface DamageRoll {
  damage: number;
  crit: boolean;
}

function validateStats(stats: CombatStats, label: string): void {
  for (const [key, value] of Object.entries(stats)) {
    assertNonNegativeInt(value, `${label}.${key}`);
  }
  if (stats.maxHp < 1) throw new RangeError(`${label}.maxHp deve ser ≥ 1`);
  if (stats.attackIntervalMs < 1) throw new RangeError(`${label}.attackIntervalMs deve ser ≥ 1`);
  if (stats.armorPenBp > BP || stats.damageReductionBp >= BP) {
    throw new RangeError(`${label}: penetração/redução fora do intervalo`);
  }
}

/**
 * Calcula um golpe. Consome sempre exatamente 2 valores do RNG
 * (variação e crítico), nessa ordem, para manter a sequência estável.
 */
export function rollDamage(attacker: Combatant, defender: Combatant, rng: Rng): DamageRoll {
  const effectiveDefense = applyBp(defender.stats.defense, BP - attacker.stats.armorPenBp);
  let damage = mulDiv(attacker.stats.attack, DEFENSE_K, DEFENSE_K + effectiveDefense);

  const varianceBp = rng.int(DAMAGE_VARIANCE_MIN_BP, DAMAGE_VARIANCE_MAX_BP);
  const crit = rng.chanceBp(attacker.stats.critChanceBp);

  damage = applyBp(damage, varianceBp);
  if (crit) damage = applyBp(damage, attacker.stats.critPowerBp);
  damage = applyBp(damage, affinityMultiplierBp(attacker.affinity, defender.affinity));
  damage = applyBp(damage, BP - defender.stats.damageReductionBp);

  return { damage: Math.max(1, damage), crit };
}

/**
 * Simula um combate 1×1 em tempo de jogo discreto.
 *
 * Cada lado ataca a cada `attackIntervalMs` (primeiro golpe após um intervalo).
 * Em empate de tempo, o jogador age primeiro. O resultado depende apenas das
 * entradas e da semente: mesma entrada ⇒ mesmo resultado, sempre.
 */
export function simulateCombat(input: CombatInput): CombatResult {
  const { player, monster, seed } = input;
  const maxDurationMs = input.maxDurationMs ?? DEFAULT_MAX_COMBAT_MS;
  validateStats(player.stats, 'player');
  validateStats(monster.stats, 'monster');
  assertNonNegativeInt(maxDurationMs, 'maxDurationMs');

  const rng = createRng(seed);
  let playerHp = player.hp ?? player.stats.maxHp;
  let monsterHp = monster.hp ?? monster.stats.maxHp;
  assertNonNegativeInt(playerHp, 'player.hp');
  assertNonNegativeInt(monsterHp, 'monster.hp');

  let nextPlayerAt = player.stats.attackIntervalMs;
  let nextMonsterAt = monster.stats.attackIntervalMs;
  let now = 0;
  let actions = 0;
  let playerDamageDealt = 0;
  let monsterDamageDealt = 0;
  const events: AttackEvent[] | undefined = input.recordEvents ? [] : undefined;
  let winner: CombatResult['winner'] = 'timeout';

  if (playerHp === 0) winner = 'monster';
  else if (monsterHp === 0) winner = 'player';

  while (winner === 'timeout' && actions < MAX_COMBAT_ACTIONS) {
    const playerActs = nextPlayerAt <= nextMonsterAt;
    const at = playerActs ? nextPlayerAt : nextMonsterAt;
    if (at > maxDurationMs) break;
    now = at;
    actions += 1;

    if (playerActs) {
      const roll = rollDamage(player, monster, rng);
      const dealt = Math.min(roll.damage, monsterHp);
      monsterHp -= dealt;
      playerDamageDealt += dealt;
      nextPlayerAt += player.stats.attackIntervalMs;
      events?.push({
        atMs: at,
        attacker: 'player',
        damage: roll.damage,
        crit: roll.crit,
        targetHpAfter: monsterHp,
      });
      if (monsterHp === 0) winner = 'player';
    } else {
      const roll = rollDamage(monster, player, rng);
      const dealt = Math.min(roll.damage, playerHp);
      playerHp -= dealt;
      monsterDamageDealt += dealt;
      nextMonsterAt += monster.stats.attackIntervalMs;
      events?.push({
        atMs: at,
        attacker: 'monster',
        damage: roll.damage,
        crit: roll.crit,
        targetHpAfter: playerHp,
      });
      if (playerHp === 0) winner = 'monster';
    }
  }

  const result: CombatResult = {
    winner,
    // Timeout por tempo dura a janela inteira; pelo teto de ações, até a última ação.
    durationMs: winner !== 'timeout' || actions >= MAX_COMBAT_ACTIONS ? now : maxDurationMs,
    playerHp,
    monsterHp,
    playerDamageDealt,
    monsterDamageDealt,
    actions,
    rngDraws: rng.draws,
  };
  if (events) result.events = events;
  return result;
}
