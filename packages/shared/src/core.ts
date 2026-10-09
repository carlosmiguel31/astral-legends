import { AFFINITY_IDS, CLASS_IDS, EQUIP_SLOTS, RARITIES } from '@astral/game-core';
import { z } from 'zod';

/** Formato padrão de erro de todas as rotas HTTP. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    /** Erros de validação por campo (mensagens já em português). */
    fields: z.record(z.string(), z.string()).optional(),
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

export const classIdSchema = z.enum(CLASS_IDS, { error: 'Classe inválida' });
export const affinityIdSchema = z.enum(AFFINITY_IDS, { error: 'Afinidade inválida' });
export const equipSlotSchema = z.enum(EQUIP_SLOTS);
export const raritySchema = z.enum(RARITIES);

/** Valores monetários trafegam como string decimal inteira (nunca ponto flutuante). */
export const moneySchema = z.string().regex(/^\d+$/);

/** Converte erros do Zod em `{ campo: mensagem }` (primeira mensagem de cada campo). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  return fields;
}
