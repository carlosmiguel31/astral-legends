import {
  AFFINITIES,
  AFFINITY_IDS,
  CLASSES,
  CLASS_IDS,
  REGIONS,
  RULESET_VERSION,
  computeCombatStats,
} from '@astral/game-core';
import type { ContentResponse } from '@astral/shared';
import type { FastifyInstance } from 'fastify';

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
    regions: Object.values(REGIONS).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      minLevel: r.minLevel,
      maxLevel: r.maxLevel,
    })),
  };
}

export async function contentRoutes(app: FastifyInstance): Promise<void> {
  const content = buildContent();
  app.get('/v1/content', async (_request, reply) => {
    void reply.header('cache-control', 'public, max-age=300');
    return content;
  });
}
