import { describe, expect, it } from 'vitest';
import { formatBp, formatDuration, formatMoney, formatSeconds } from './format';

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

describe('formatMoney', () => {
  it('separa milhares sem converter para número', () => {
    expect(formatMoney('0')).toBe('0');
    expect(formatMoney('1234')).toBe('1.234');
    expect(formatMoney('9007199254740993123')).toBe('9.007.199.254.740.993.123');
  });
});

describe('formatDuration', () => {
  it('mostra horas, minutos ou segundos', () => {
    expect(formatDuration(5_400_000)).toBe('1 h 30 min');
    expect(formatDuration(8 * 3_600_000)).toBe('8 h');
    expect(formatDuration(125_000)).toBe('2 min');
    expect(formatDuration(42_000)).toBe('42 s');
  });
});
