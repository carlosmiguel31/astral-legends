/**
 * Gerador pseudoaleatório determinístico (SFC32) com sementes de 32 bits.
 *
 * - Nunca use Math.random() em regras de gameplay.
 * - Só usa operações inteiras de 32 bits (Math.imul, >>>, ^), que têm
 *   comportamento idêntico em qualquer engine JavaScript.
 * - `deriveSeed` permite gerar sub-sementes independentes (ex.: uma por
 *   encontro de caça), o que torna a liquidação idle retomável e idempotente.
 */

import { assertSafeInt } from './imath.js';

const UINT32 = 0x1_0000_0000;

/** Mistura final do MurmurHash3 (fmix32): boa difusão de bits. */
function fmix32(input: number): number {
  let h = input >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85eb_ca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2_ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function toUint32(value: number, label: string): number {
  assertSafeInt(value, label);
  if (value < 0 || value >= UINT32) {
    throw new RangeError(`${label} deve estar entre 0 e 2^32-1 (recebido: ${value})`);
  }
  return value >>> 0;
}

/** Deriva uma semente filha a partir de uma semente base e de componentes inteiros. */
export function deriveSeed(base: number, ...parts: number[]): number {
  let h = fmix32(toUint32(base, 'base') ^ 0x9e37_79b9);
  for (const part of parts) {
    assertSafeInt(part, 'parte da semente');
    // Componentes podem ser maiores que 32 bits (ex.: timestamps): mistura alto e baixo.
    const low = part >>> 0;
    const high = Math.floor(part / UINT32) >>> 0;
    h = fmix32(h ^ fmix32(low + 0x7f4a_7c15));
    h = fmix32(h ^ fmix32(high + 0x1656_67b1));
  }
  return h;
}

export interface Rng {
  /** Inteiro uniforme em [0, 2^32). */
  nextU32(): number;
  /** Inteiro uniforme em [min, max], sem viés de módulo. */
  int(min: number, max: number): number;
  /** true com probabilidade `bp / 10_000`. */
  chanceBp(bp: number): boolean;
  /** Quantidade de valores consumidos (útil para auditoria e testes de regressão). */
  readonly draws: number;
}

export function createRng(seed: number): Rng {
  const s = toUint32(seed, 'seed');
  // Inicializa o estado a partir de sub-sementes; descarta as primeiras saídas.
  let a = deriveSeed(s, 1);
  let b = deriveSeed(s, 2);
  let c = deriveSeed(s, 3);
  let d = 1;
  let draws = 0;

  const step = (): number => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t >>> 0;
  };
  for (let i = 0; i < 12; i += 1) step();

  const rng: Rng = {
    nextU32() {
      draws += 1;
      return step();
    },
    int(min, max) {
      assertSafeInt(min, 'min');
      assertSafeInt(max, 'max');
      if (max < min) throw new RangeError(`intervalo inválido [${min}, ${max}]`);
      const range = max - min + 1;
      if (range > UINT32) throw new RangeError('intervalo maior que 2^32 não suportado');
      // Amostragem por rejeição para eliminar o viés de módulo.
      const limit = UINT32 - (UINT32 % range);
      let x = rng.nextU32();
      while (x >= limit) x = rng.nextU32();
      return min + (x % range);
    },
    chanceBp(bp) {
      assertSafeInt(bp, 'bp');
      // Consome sempre exatamente um valor, mesmo nos extremos, para manter a sequência estável.
      const roll = rng.int(0, 9_999);
      return roll < bp;
    },
    get draws() {
      return draws;
    },
  };
  return rng;
}
