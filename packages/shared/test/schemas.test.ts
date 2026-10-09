import { describe, expect, it } from 'vitest';
import { wsClientMessageSchema, wsServerMessageSchema } from '../src/index.js';

describe('schemas de WebSocket', () => {
  it('aceita ping válido e rejeita tipos desconhecidos', () => {
    expect(wsClientMessageSchema.safeParse({ type: 'ping', nonce: 'abc' }).success).toBe(true);
    expect(wsClientMessageSchema.safeParse({ type: 'grantGold', amount: 999 }).success).toBe(false);
  });

  it('limita o tamanho do nonce', () => {
    expect(wsClientMessageSchema.safeParse({ type: 'ping', nonce: 'x'.repeat(65) }).success).toBe(
      false,
    );
  });

  it('valida mensagens do servidor', () => {
    expect(
      wsServerMessageSchema.safeParse({ type: 'hello', protocol: 1, serverTime: 1 }).success,
    ).toBe(true);
  });
});
