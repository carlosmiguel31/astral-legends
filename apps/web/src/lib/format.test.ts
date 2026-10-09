import { describe, expect, it } from 'vitest';
import { formatBp, formatSeconds } from './format';

describe('formatBp', () => {
  it('converte basis points em percentual pt-BR', () => {
    expect(formatBp(880)).toBe('8,8%');
    expect(formatBp(10_000)).toBe('100%');
    expect(formatBp(5)).toBe('0,05%');
    expect(formatBp(-250)).toBe('-2,5%');
  });
});

describe('formatSeconds', () => {
  it('formata milissegundos em segundos com vírgula', () => {
    expect(formatSeconds(1_581)).toBe('1,58 s');
    expect(formatSeconds(2_000)).toBe('2 s');
    expect(formatSeconds(1_067)).toBe('1,06 s');
  });
});
