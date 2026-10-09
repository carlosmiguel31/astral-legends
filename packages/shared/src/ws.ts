import { z } from 'zod';

/** Versão do protocolo WebSocket. Clientes incompatíveis devem recarregar. */
export const WS_PROTOCOL_VERSION = 2;

/** Mensagens cliente → servidor. Toda entrada é validada; o resto é descartado. */
export const wsClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ping'), nonce: z.string().max(64) }),
]);
export type WsClientMessage = z.infer<typeof wsClientMessageSchema>;

export const stateChangeReasonSchema = z.enum(['hunt', 'inventory', 'character']);
export type StateChangeReason = z.infer<typeof stateChangeReasonSchema>;

/** Mensagens servidor → cliente. Notificações não carregam dados: o cliente busca via HTTP. */
export const wsServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    protocol: z.number().int(),
    serverTime: z.number().int(),
    authenticated: z.boolean(),
  }),
  z.object({ type: z.literal('pong'), nonce: z.string(), serverTime: z.number().int() }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
  z.object({ type: z.literal('state.changed'), reason: stateChangeReasonSchema }),
  z.object({ type: z.literal('session.revoked') }),
]);
export type WsServerMessage = z.infer<typeof wsServerMessageSchema>;
