import { assertNonNegativeInt } from '../imath.js';
import { MONSTERS } from './monsters.js';
import { REGIONS } from './regions.js';

/**
 * Valida a integridade do conteúdo estático. Executado nos testes e na
 * inicialização do servidor: conteúdo inválido impede o boot.
 */
export function validateContent(): void {
  for (const monster of Object.values(MONSTERS)) {
    for (const [key, value] of Object.entries(monster.stats)) {
      assertNonNegativeInt(value, `${monster.id}.stats.${key}`);
    }
    for (const [key, value] of Object.entries(monster.rewards)) {
      assertNonNegativeInt(value, `${monster.id}.rewards.${key}`);
    }
    if (monster.rewards.goldMin > monster.rewards.goldMax) {
      throw new Error(`${monster.id}: goldMin > goldMax`);
    }
  }
  for (const region of Object.values(REGIONS)) {
    if (region.spawns.length === 0) throw new Error(`${region.id}: sem spawns`);
    for (const spawn of region.spawns) {
      if (!MONSTERS[spawn.monsterId])
        throw new Error(`${region.id}: monstro inexistente ${spawn.monsterId}`);
      assertNonNegativeInt(spawn.weight, `${region.id}.${spawn.monsterId}.weight`);
      if (spawn.weight === 0) throw new Error(`${region.id}: peso zero para ${spawn.monsterId}`);
    }
    if (region.bossId !== null) {
      const boss = MONSTERS[region.bossId];
      if (!boss) throw new Error(`${region.id}: chefe inexistente ${region.bossId}`);
      if (!boss.isBoss) throw new Error(`${region.id}: ${region.bossId} não é chefe`);
    }
  }
}
