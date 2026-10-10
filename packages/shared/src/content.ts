import { z } from 'zod';
import { affinityIdSchema, classIdSchema, equipSlotSchema, raritySchema } from './core.js';

const intRange = z.tuple([z.number().int(), z.number().int()]);

const specialMonsterSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  level: z.number().int(),
  affinity: affinityIdSchema,
});

export const regionInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  minLevel: z.number().int(),
  maxLevel: z.number().int(),
  difficulty: z.string(),
  unlock: z.object({ minLevel: z.number().int(), description: z.string() }),
  monsters: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      level: z.number().int(),
      affinity: affinityIdSchema,
      spawnChanceBp: z.number().int(),
    }),
  ),
  rewards: z.object({
    xp: intRange,
    gold: intRange,
    essenceChanceBp: intRange,
    itemDropChanceBp: intRange,
  }),
  loot: z.array(z.object({ id: z.string(), name: z.string(), slot: equipSlotSchema })),
  waves: z.object({
    count: z.number().int(),
    winsPerWave: z.number().int(),
    elite: specialMonsterSchema.nullable(),
    boss: specialMonsterSchema.nullable(),
    /** Uma entrada por wave implementada (índice 0 = wave 1). */
    list: z.array(
      z.object({
        wave: z.number().int(),
        kind: z.enum(['normal', 'elite', 'boss']),
        minLevel: z.number().int(),
        statBp: z.number().int(),
        rewardBp: z.number().int(),
        firstClear: z.object({
          gold: z.number().int(),
          essence: z.number().int(),
          itemRarity: raritySchema.nullable(),
        }),
      }),
    ),
  }),
});
export type RegionInfo = z.infer<typeof regionInfoSchema>;

export const contentResponseSchema = z.object({
  rulesetVersion: z.number().int(),
  classes: z.array(
    z.object({
      id: classIdSchema,
      name: z.string(),
      role: z.string(),
      lore: z.string(),
      level1Stats: z.object({
        maxHp: z.number().int(),
        attack: z.number().int(),
        defense: z.number().int(),
        critChanceBp: z.number().int(),
        attackIntervalMs: z.number().int(),
      }),
    }),
  ),
  affinities: z.array(
    z.object({
      id: affinityIdSchema,
      name: z.string(),
      description: z.string(),
      strongAgainst: affinityIdSchema,
    }),
  ),
  regions: z.array(regionInfoSchema),
});
export type ContentResponse = z.infer<typeof contentResponseSchema>;
