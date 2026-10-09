import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed } from '../src/rng.js';

describe('createRng', () => {
  it('é determinístico para a mesma semente', () => {
    const a = createRng(123_456);
    const b = createRng(123_456);
    const seqA = Array.from({ length: 50 }, () => a.nextU32());
    const seqB = Array.from({ length: 50 }, () => b.nextU32());
    expect(seqA).toEqual(seqB);
  });

  it('produz sequências diferentes para sementes diferentes', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a.nextU32());
    const seqB = Array.from({ length: 10 }, () => b.nextU32());
    expect(seqA).not.toEqual(seqB);
  });

  it('mantém uma sequência fixa (regressão: mudar o algoritmo quebra replays)', () => {
    const rng = createRng(42);
    expect(Array.from({ length: 5 }, () => rng.nextU32())).toMatchSnapshot();
  });

  it('int respeita os limites e cobre o intervalo', () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 5_000; i += 1) {
      const v = rng.int(3, 8);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(8);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('int tem distribuição aproximadamente uniforme', () => {
    const rng = createRng(99);
    const counts = [0, 0, 0, 0];
    const n = 40_000;
    for (let i = 0; i < n; i += 1) counts[rng.int(0, 3)]! += 1;
    for (const c of counts) expect(Math.abs(c - n / 4)).toBeLessThan(n * 0.02);
  });

  it('chanceBp respeita extremos e consome um valor por chamada', () => {
    const rng = createRng(5);
    for (let i = 0; i < 1_000; i += 1) {
      expect(rng.chanceBp(0)).toBe(false);
      expect(rng.chanceBp(10_000)).toBe(true);
    }
    expect(rng.draws).toBe(2_000);
  });

  it('rejeita sementes fora de uint32', () => {
    expect(() => createRng(-1)).toThrow(RangeError);
    expect(() => createRng(2 ** 32)).toThrow(RangeError);
    expect(() => createRng(1.5)).toThrow(RangeError);
  });
});

describe('deriveSeed', () => {
  it('é estável e sensível a cada componente', () => {
    expect(deriveSeed(10, 1, 2)).toBe(deriveSeed(10, 1, 2));
    expect(deriveSeed(10, 1, 2)).not.toBe(deriveSeed(10, 2, 1));
    expect(deriveSeed(10, 1)).not.toBe(deriveSeed(11, 1));
  });

  it('aceita componentes maiores que 32 bits (ex.: timestamps)', () => {
    const t = 1_791_500_000_000;
    expect(deriveSeed(1, t)).not.toBe(deriveSeed(1, t + 2 ** 32));
  });
});
