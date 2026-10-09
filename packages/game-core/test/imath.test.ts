import { describe, expect, it } from 'vitest';
import { applyBp, idiv, mulDiv } from '../src/imath.js';

describe('idiv', () => {
  it('faz divisão inteira com arredondamento para baixo', () => {
    expect(idiv(7, 2)).toBe(3);
    expect(idiv(0, 5)).toBe(0);
    expect(idiv(10, 10)).toBe(1);
  });

  it('é exata perto do limite de inteiros seguros', () => {
    const a = Number.MAX_SAFE_INTEGER;
    expect(idiv(a, 3)).toBe(Number((BigInt(a) / 3n).toString()));
    expect(idiv(a - 1, 7)).toBe(Number(((BigInt(a) - 1n) / 7n).toString()));
  });

  it('rejeita entradas inválidas', () => {
    expect(() => idiv(1.5, 2)).toThrow(RangeError);
    expect(() => idiv(-1, 2)).toThrow(RangeError);
    expect(() => idiv(1, 0)).toThrow(RangeError);
  });
});

describe('mulDiv / applyBp', () => {
  it('usa BigInt quando o produto excede 2^53', () => {
    const big = 2 ** 40;
    expect(mulDiv(big, big, big)).toBe(big);
  });

  it('aplica basis points com floor', () => {
    expect(applyBp(100, 12_500)).toBe(125);
    expect(applyBp(99, 3_333)).toBe(32);
    expect(applyBp(1, 9_999)).toBe(0);
  });
});
