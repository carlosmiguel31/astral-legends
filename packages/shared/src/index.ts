import { AFFINITY_IDS, CLASS_IDS } from '@astral/game-core';
import { z } from 'zod';

/** Versão do protocolo WebSocket. Clientes incompatíveis devem recarregar. */
export const WS_PROTOCOL_VERSION = 1;

/** Formato padrão de erro de todas as rotas HTTP. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const healthLiveSchema = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.number().int(),
});

const dependencyStatus = z.enum(['up', 'down']);
export const healthReadySchema = z.object({
  status: z.enum(['ready', 'degraded']),
  checks: z.object({ database: dependencyStatus, redis: dependencyStatus }),
});
export type HealthReady = z.infer<typeof healthReadySchema>;

export const classIdSchema = z.enum(CLASS_IDS);
export const affinityIdSchema = z.enum(AFFINITY_IDS);

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
  regions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      minLevel: z.number().int(),
      maxLevel: z.number().int(),
    }),
  ),
});
export type ContentResponse = z.infer<typeof contentResponseSchema>;

/** Mensagens cliente → servidor. Toda entrada é validada; o resto é descartado. */
export const wsClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ping'), nonce: z.string().max(64) }),
]);
export type WsClientMessage = z.infer<typeof wsClientMessageSchema>;

/** Mensagens servidor → cliente. */
export const wsServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), protocol: z.number().int(), serverTime: z.number().int() }),
  z.object({ type: z.literal('pong'), nonce: z.string(), serverTime: z.number().int() }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type WsServerMessage = z.infer<typeof wsServerMessageSchema>;
