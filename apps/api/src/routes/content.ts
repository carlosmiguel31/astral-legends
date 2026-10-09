import {
  AFFINITIES,
  AFFINITY_IDS,
  CLASSES,
  CLASS_IDS,
  ITEMS,
  MONSTERS,
  REGIONS,
  REGION_ORDER,
  RULESET_VERSION,
  computeCombatStats,
  type MonsterDefinition,
  type RegionDefinition,
} from '@astral/game-core';
import type { ContentResponse, RegionInfo } from '@astral/shared';
import type { FastifyInstance } from 'fastify';

function range(values: number[]): [number, number] {
  return [Math.min(...values), Math.max(...values)];
}

function regionInfo(region: RegionDefinition): RegionInfo {
  const totalWeight = region.spawns.reduce((sum, s) => sum + s.weight, 0);
  const monsters = region.spawns.map((s) => ({ def: MONSTERS[s.monsterId]!, weight: s.weight }));
  const defs: MonsterDefinition[] = monsters.map((m) => m.def);
  return {
    id: region.id,
    name: region.name,
    description: region.description,
    minLevel: region.minLevel,
    maxLevel: region.maxLevel,
    difficulty: region.difficulty,
    unlock: {
      minLevel: region.minLevel,
      description:
        region.minLevel <= 1 ? 'Disponível desde o início' : `Alcance o nível ${region.minLevel}`,
    },
    monsters: monsters.map(({ def, weight }) => ({
      id: def.id,
      name: def.name,
      description: def.description,
      level: def.level,
      affinity: def.affinity,
      // Divisão inteira: a soma pode ficar alguns bp abaixo de 10 000.
      spawnChanceBp: Math.floor((weight * 10_000) / totalWeight),
    })),
    rewards: {
      xp: range(defs.map((d) => d.rewards.xp)),
      gold: [
        Math.min(...defs.map((d) => d.rewards.goldMin)),
        Math.max(...defs.map((d) => d.rewards.goldMax)),
      ],
      essenceChanceBp: range(defs.map((d) => d.rewards.essenceChanceBp)),
      itemDropChanceBp: range(defs.map((d) => d.rewards.itemDropChanceBp)),
    },
    loot: region.loot.map((l) => {
      const item = ITEMS[l.itemId]!;
      return { id: item.id, name: item.name, slot: item.slot };
    }),
  };
}

/** Conteúdo público e estático das regras atuais, derivado diretamente do game-core. */
function buildContent(): ContentResponse {
  return {
    rulesetVersion: RULESET_VERSION,
    classes: CLASS_IDS.map((id) => {
      const def = CLASSES[id];
      // Estatísticas de referência no nível 1 com afinidade Lunar (passiva: +3% de crítico).
      const stats = computeCombatStats({ classId: id, affinity: 'lunar', level: 1, equipment: [] });
      return {
        id,
        name: def.name,
        role: def.role,
        lore: def.lore,
        level1Stats: {
          maxHp: stats.maxHp,
          attack: stats.attack,
          defense: stats.defense,
          critChanceBp: stats.critChanceBp,
          attackIntervalMs: stats.attackIntervalMs,
        },
      };
    }),
    affinities: AFFINITY_IDS.map((id) => {
      const def = AFFINITIES[id];
      return { id, name: def.name, description: def.description, strongAgainst: def.strongAgainst };
    }),
    regions: REGION_ORDER.map((id) => regionInfo(REGIONS[id]!)),
  };
}

export async function contentRoutes(app: FastifyInstance): Promise<void> {
  const content = buildContent();
  app.get('/v1/content', async (_request, reply) => {
    void reply.header('cache-control', 'public, max-age=300');
    return content;
  });
}
