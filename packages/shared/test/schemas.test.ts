import { describe, expect, it } from 'vitest';
import {
  characterNameSchema,
  createCharacterRequestSchema,
  fieldErrors,
  registerRequestSchema,
  wsClientMessageSchema,
  wsServerMessageSchema,
} from '../src/index.js';

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
      wsServerMessageSchema.safeParse({
        type: 'hello',
        protocol: 2,
        serverTime: 1,
        authenticated: false,
      }).success,
    ).toBe(true);
    expect(wsServerMessageSchema.safeParse({ type: 'state.changed', reason: 'hunt' }).success).toBe(
      true,
    );
  });
});

describe('cadastro', () => {
  const valid = {
    username: 'Estelar_01',
    email: '  Jogador@Exemplo.COM ',
    password: 'constelacao-azul-42',
    passwordConfirm: 'constelacao-azul-42',
  };

  it('normaliza o e-mail e aceita dados válidos', () => {
    const parsed = registerRequestSchema.parse(valid);
    expect(parsed.email).toBe('jogador@exemplo.com');
  });

  it('explica cada erro por campo', () => {
    const result = registerRequestSchema.safeParse({
      username: 'ab',
      email: 'nao-e-email',
      password: 'curta',
      passwordConfirm: 'outra',
    });
    expect(result.success).toBe(false);
    const fields = fieldErrors(result.error!);
    expect(fields.username).toMatch(/3 a 16/);
    expect(fields.email).toMatch(/inválido/);
    expect(fields.password).toMatch(/pelo menos 10/);
  });

  it('exige confirmação igual e proíbe senha contendo o usuário', () => {
    const mismatch = registerRequestSchema.safeParse({ ...valid, passwordConfirm: 'diferente-123' });
    expect(fieldErrors(mismatch.error!).passwordConfirm).toMatch(/não coincidem/);
    const weak = registerRequestSchema.safeParse({
      ...valid,
      password: 'estelar_01-forte',
      passwordConfirm: 'estelar_01-forte',
    });
    expect(fieldErrors(weak.error!).password).toMatch(/nome de usuário/);
  });

  it('rejeita campos extras', () => {
    expect(registerRequestSchema.safeParse({ ...valid, role: 'ADMIN' }).success).toBe(false);
  });
});

describe('personagem', () => {
  it('aceita nomes com acentos e rejeita símbolos, espaços e números', () => {
    expect(characterNameSchema.parse('Aurélia')).toBe('Aurélia');
    for (const bad of ['Al', 'Nome Com Espaço', 'Astra2', 'x<script>', 'Ａｓｔｒａ', 'Аstra']) {
      expect(characterNameSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('não aceita atributos vindos do cliente', () => {
    const result = createCharacterRequestSchema.safeParse({
      name: 'Astra',
      classId: 'blade',
      affinity: 'lunar',
      appearance: { hair: 0, skin: 0, cloak: 0 },
      level: 99,
    });
    expect(result.success).toBe(false);
  });

  it('valida classe, afinidade e aparência', () => {
    const base = { name: 'Astra', classId: 'blade', affinity: 'lunar', appearance: { hair: 1, skin: 2, cloak: 3 } };
    expect(createCharacterRequestSchema.safeParse(base).success).toBe(true);
    expect(createCharacterRequestSchema.safeParse({ ...base, classId: 'paladino' }).success).toBe(false);
    expect(createCharacterRequestSchema.safeParse({ ...base, affinity: 'fogo' }).success).toBe(false);
    expect(
      createCharacterRequestSchema.safeParse({ ...base, appearance: { hair: 9, skin: 0, cloak: 0 } })
        .success,
    ).toBe(false);
  });
});
