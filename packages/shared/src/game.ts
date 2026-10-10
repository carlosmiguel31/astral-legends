import { z } from 'zod';
import {
  affinityIdSchema,
  classIdSchema,
  equipSlotSchema,
  moneySchema,
  raritySchema,
} from './core.js';

// ───────────────────────────── Personagem ─────────────────────────────

/** Letras (com acentos do português), sem espaços, números ou símbolos. */
export const CHARACTER_NAME_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ÿ]{3,16}$/;

export const characterNameSchema = z
  .string({ error: 'Informe o nome do personagem' })
  .trim()
  .normalize('NFC')
  .regex(CHARACTER_NAME_PATTERN, 'Use de 3 a 16 letras, sem espaços, números ou símbolos');

/** Quantidade de opções de cada traço de aparência (índices 0..n-1). */
export const APPEARANCE_OPTIONS = { hair: 6, skin: 5, cloak: 6 } as const;

export const appearanceSchema = z.strictObject({
  hair: z
    .number()
    .int()
    .min(0)
    .max(APPEARANCE_OPTIONS.hair - 1),
  skin: z
    .number()
    .int()
    .min(0)
    .max(APPEARANCE_OPTIONS.skin - 1),
  cloak: z
    .number()
    .int()
    .min(0)
    .max(APPEARANCE_OPTIONS.cloak - 1),
});
export type Appearance = z.infer<typeof appearanceSchema>;

/**
 * Criação de personagem: só escolhas do jogador. Atributos, nível e equipamento
 * são definidos pelo servidor; campos extras são rejeitados (`strictObject`).
 */
export const createCharacterRequestSchema = z.strictObject({
  name: characterNameSchema,
  classId: classIdSchema,
  affinity: affinityIdSchema,
  appearance: appearanceSchema,
});
export type CreateCharacterRequest = z.infer<typeof createCharacterRequestSchema>;

const attributesSchema = z.object({
  str: z.number().int(),
  int: z.number().int(),
  agi: z.number().int(),
  vit: z.number().int(),
});

const combatStatsSchema = z.object({
  maxHp: z.number().int(),
  attack: z.number().int(),
  defense: z.number().int(),
  critChanceBp: z.number().int(),
  critPowerBp: z.number().int(),
  attackIntervalMs: z.number().int(),
  armorPenBp: z.number().int(),
  damageReductionBp: z.number().int(),
});

const itemBonusesSchema = z.object({
  attributes: attributesSchema.partial().optional(),
  stats: z
    .object({
      maxHp: z.number().int(),
      attack: z.number().int(),
      defense: z.number().int(),
      critChanceBp: z.number().int(),
    })
    .partial()
    .optional(),
});

export const itemViewSchema = z.object({
  id: z.string(),
  defId: z.string(),
  name: z.string(),
  description: z.string(),
  slot: equipSlotSchema,
  rarity: raritySchema,
  rarityName: z.string(),
  upgradeLevel: z.number().int(),
  bonuses: itemBonusesSchema,
  minLevel: z.number().int(),
  classes: z.array(classIdSchema).nullable(),
  equipped: z.boolean(),
  usable: z.boolean(),
  unusableReason: z.enum(['ok', 'level', 'class']),
  obtainedAt: z.string(),
});
export type ItemView = z.infer<typeof itemViewSchema>;

// ───────────────────────────── Waves ─────────────────────────────

export const huntModeSchema = z.enum(['advance', 'farm'], { error: 'Modo inválido' });
export type HuntModeView = z.infer<typeof huntModeSchema>;
export const waveKindSchema = z.enum(['normal', 'elite', 'boss']);

export const waveNoticeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('retreat'), fromWave: z.number().int(), toWave: z.number().int() }),
  z.object({ type: z.literal('content_limit'), wave: z.number().int() }),
  z.object({
    type: z.literal('level_gate'),
    wave: z.number().int(),
    nextWave: z.number().int(),
    minLevel: z.number().int(),
  }),
]);
export type WaveNoticeView = z.infer<typeof waveNoticeSchema>;

/** Progresso de waves de uma região (sempre calculado pelo servidor). */
export const regionProgressViewSchema = z.object({
  regionId: z.string(),
  mode: huntModeSchema,
  wave: z.number().int(),
  waveKind: waveKindSchema,
  /** Tipo do próximo encontro (o especial só aparece na última posição). */
  nextEncounterKind: waveKindSchema,
  waveWins: z.number().int(),
  waveLosses: z.number().int(),
  failStreak: z.number().int(),
  totals: z.object({
    xp: z.number().int(),
    gold: moneySchema,
    essence: moneySchema,
    items: z.number().int(),
  }),
  highestCleared: z.number().int(),
  unlockedWave: z.number().int(),
  maxSelectableWave: z.number().int(),
  waveCount: z.number().int(),
  totalClears: z.number().int(),
  notice: waveNoticeSchema.nullable(),
});
export type RegionProgressView = z.infer<typeof regionProgressViewSchema>;

export const waveClearViewSchema = z.object({
  regionId: z.string(),
  wave: z.number().int(),
  kind: waveKindSchema,
  mode: huntModeSchema,
  encounterIndex: z.number().int(),
  firstClear: z.boolean(),
  wins: z.number().int(),
  losses: z.number().int(),
  xp: z.number().int(),
  gold: moneySchema,
  essence: moneySchema,
  items: z.number().int(),
  firstClearReward: z
    .object({
      gold: moneySchema,
      essence: moneySchema,
      item: z.object({ defId: z.string(), name: z.string(), rarity: raritySchema }).nullable(),
    })
    .nullable(),
  next: z.object({
    mode: huntModeSchema,
    wave: z.number().int(),
    reason: z.enum(['advance', 'repeat', 'level_gate', 'content_limit']),
  }),
  clearedAt: z.string(),
});
export type WaveClearView = z.infer<typeof waveClearViewSchema>;

export const huntViewSchema = z.object({
  status: z.enum(['ACTIVE', 'STOPPED']),
  regionId: z.string(),
  runId: z.string(),
  startedAt: z.string(),
  lastSettledAt: z.string(),
  encountersResolved: z.number().int(),
  offlineCapMs: z.number().int(),
});
export type HuntView = z.infer<typeof huntViewSchema>;

export const gameStateSchema = z.object({
  serverTime: z.string(),
  rulesetVersion: z.number().int(),
  character: z.object({
    id: z.string(),
    name: z.string(),
    classId: classIdSchema,
    affinity: affinityIdSchema,
    appearance: appearanceSchema,
    level: z.number().int(),
    xp: z.number().int(),
    xpToNext: z.number().int(),
    maxLevel: z.number().int(),
  }),
  attributes: attributesSchema,
  stats: combatStatsSchema,
  wallet: z.object({ gold: moneySchema, essence: moneySchema, diamonds: moneySchema }),
  hunt: huntViewSchema.nullable(),
  equipment: z.array(itemViewSchema),
  inventory: z.object({ count: z.number().int(), capacity: z.number().int() }),
  waves: z.object({
    winsPerWave: z.number().int(),
    /** Uma entrada por região, na ordem de progressão. */
    regions: z.array(regionProgressViewSchema),
    /** Conclusão de wave mais recente (para o resumo e o feedback). */
    lastClear: waveClearViewSchema.nullable(),
  }),
});
export type GameState = z.infer<typeof gameStateSchema>;

// ───────────────────────────── Caça ─────────────────────────────

const regionIdSchema = z.string({ error: 'Informe a região' }).min(1).max(64);
const waveNumberSchema = z
  .number({ error: 'Informe a wave' })
  .int('Wave inválida')
  .min(1, 'Wave inválida')
  .max(1_000, 'Wave inválida');

export const startHuntRequestSchema = z.strictObject({
  regionId: regionIdSchema,
  mode: huntModeSchema.optional(),
  wave: waveNumberSchema.optional(),
});

/** Troca de modo e/ou wave. Validada e aplicada pelo servidor numa fronteira definida. */
export const huntSettingsRequestSchema = z
  .strictObject({
    regionId: regionIdSchema,
    mode: huntModeSchema.optional(),
    wave: waveNumberSchema.optional(),
  })
  .refine((v) => v.mode !== undefined || v.wave !== undefined, {
    message: 'Informe o modo ou a wave',
    path: ['mode'],
  });
export type HuntSettingsRequest = z.infer<typeof huntSettingsRequestSchema>;

const attackEventSchema = z.object({
  atMs: z.number().int(),
  attacker: z.enum(['player', 'monster']),
  damage: z.number().int(),
  crit: z.boolean(),
  targetHpAfter: z.number().int(),
});

export const encounterViewSchema = z.object({
  runId: z.string(),
  index: z.number().int(),
  monsterId: z.string(),
  monsterName: z.string(),
  monsterLevel: z.number().int(),
  outcome: z.enum(['win', 'loss', 'timeout']),
  startedAt: z.number().int(),
  combatStartAt: z.number().int(),
  combatMs: z.number().int(),
  endedAt: z.number().int(),
  playerMaxHp: z.number().int(),
  monsterMaxHp: z.number().int(),
  damageDealt: z.number().int(),
  damageTaken: z.number().int(),
  xp: z.number().int(),
  gold: z.number().int(),
  essence: z.number().int(),
  drop: z
    .object({ defId: z.string(), name: z.string(), rarity: raritySchema, kept: z.boolean() })
    .nullable(),
  levelBefore: z.number().int(),
  levelAfter: z.number().int(),
  levelUp: z.boolean(),
  // Fase 2A: ausentes em encontros registrados antes das waves.
  wave: z.number().int().optional(),
  mode: huntModeSchema.optional(),
  position: z.number().int().optional(),
  kind: waveKindSchema.optional(),
  waveWinsAfter: z.number().int().optional(),
  waveCleared: z.boolean().optional(),
  firstClear: z.boolean().optional(),
  events: z.array(attackEventSchema).optional(),
});
export type EncounterView = z.infer<typeof encounterViewSchema>;

export const settlementViewSchema = z.object({
  fromEncounter: z.number().int(),
  toEncounter: z.number().int(),
  encounters: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
  timeouts: z.number().int(),
  xpGained: z.number().int(),
  gold: moneySchema,
  essence: moneySchema,
  itemsDropped: z.number().int(),
  itemsDiscarded: z.number().int(),
  levelBefore: z.number().int(),
  levelAfter: z.number().int(),
  forfeitedMs: z.number().int(),
  windowStart: z.string(),
  windowEnd: z.string(),
  createdAt: z.string(),
  waveBefore: z.number().int().nullable(),
  waveAfter: z.number().int().nullable(),
  modeAfter: huntModeSchema.nullable(),
  wavesCleared: z.number().int(),
  firstClears: z.number().int(),
  firstClearGold: moneySchema,
  firstClearEssence: moneySchema,
});
export type SettlementView = z.infer<typeof settlementViewSchema>;

/** Resposta de sincronização: estado persistido + o que foi liquidado agora. */
export const syncResponseSchema = z.object({
  state: gameStateSchema,
  settlement: settlementViewSchema.nullable(),
  /** Encontros mais recentes da caçada atual (de qualquer liquidação), em ordem. */
  recentEncounters: z.array(encounterViewSchema),
  /** Waves concluídas nesta requisição (feedback imediato). */
  waveClears: z.array(waveClearViewSchema),
});
export type SyncResponse = z.infer<typeof syncResponseSchema>;

export const huntHistoryResponseSchema = z.object({
  settlements: z.array(settlementViewSchema.extend({ regionId: z.string() })),
  recentEncounters: z.array(encounterViewSchema),
  waveClears: z.array(waveClearViewSchema),
});
export type HuntHistoryResponse = z.infer<typeof huntHistoryResponseSchema>;

// ───────────────────────────── Inventário ─────────────────────────────

export const inventoryResponseSchema = z.object({
  items: z.array(itemViewSchema),
  capacity: z.number().int(),
});
export type InventoryResponse = z.infer<typeof inventoryResponseSchema>;

export const itemIdParamsSchema = z.strictObject({
  itemId: z.uuid('Item inválido'),
});
