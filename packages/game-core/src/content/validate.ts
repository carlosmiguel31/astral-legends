import { assertNonNegativeInt } from '../imath.js';
import { ITEMS, STARTER_WEAPON } from './items.js';
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

  for (const item of Object.values(ITEMS)) {
    assertNonNegativeInt(item.minLevel, `${item.id}.minLevel`);
    const ranges = [
      ...Object.entries(item.bonusRanges.attributes ?? {}),
      ...Object.entries(item.bonusRanges.stats ?? {}),
    ];
    if (ranges.length === 0) throw new Error(`${item.id}: item sem bônus`);
    for (const [key, range] of ranges) {
      if (!range) continue;
      assertNonNegativeInt(range[0], `${item.id}.${key}.min`);
      assertNonNegativeInt(range[1], `${item.id}.${key}.max`);
      if (range[0] > range[1]) throw new Error(`${item.id}.${key}: mínimo maior que máximo`);
    }
  }
  for (const [classId, itemId] of Object.entries(STARTER_WEAPON)) {
    const item = ITEMS[itemId];
    if (!item) throw new Error(`arma inicial inexistente para ${classId}: ${itemId}`);
    if (item.slot !== 'weapon') throw new Error(`arma inicial de ${classId} não é arma`);
  }

  let previousMin = 0;
  for (const region of Object.values(REGIONS)) {
    if (region.minLevel < previousMin) throw new Error(`${region.id}: regiões fora de ordem`);
    previousMin = region.minLevel;
    if (region.spawns.length === 0) throw new Error(`${region.id}: sem spawns`);
    for (const spawn of region.spawns) {
      const monster = MONSTERS[spawn.monsterId];
      if (!monster) throw new Error(`${region.id}: monstro inexistente ${spawn.monsterId}`);
      if (monster.isBoss) throw new Error(`${region.id}: chefe não pode ser spawn comum`);
      assertNonNegativeInt(spawn.weight, `${region.id}.${spawn.monsterId}.weight`);
      if (spawn.weight === 0) throw new Error(`${region.id}: peso zero para ${spawn.monsterId}`);
    }
    for (const entry of region.loot) {
      const item = ITEMS[entry.itemId];
      if (!item) throw new Error(`${region.id}: item inexistente ${entry.itemId}`);
      assertNonNegativeInt(entry.weight, `${region.id}.${entry.itemId}.weight`);
      if (entry.weight === 0) throw new Error(`${region.id}: peso zero para ${entry.itemId}`);
      if (item.minLevel > region.maxLevel)
        throw new Error(`${region.id}: ${item.id} acima da região`);
    }
    if (region.bossId !== null) {
      const boss = MONSTERS[region.bossId];
      if (!boss) throw new Error(`${region.id}: chefe inexistente ${region.bossId}`);
      if (!boss.isBoss) throw new Error(`${region.id}: ${region.bossId} não é chefe`);
    }
  }
}
