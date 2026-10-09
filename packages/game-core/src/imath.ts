/**
 * Aritmética inteira determinística.
 *
 * Todas as regras de gameplay usam inteiros. Percentuais são expressos em
 * basis points (1 bp = 0,01%; 10_000 bp = 100%). Isso evita divergência de
 * ponto flutuante entre servidor, testes e eventuais réplicas, e mantém os
 * resultados reproduzíveis a partir de uma semente.
 */

/** 100% em basis points. */
export const BP = 10_000;

export function assertSafeInt(value: number, label = 'value'): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} deve ser um inteiro seguro (recebido: ${value})`);
  }
}

export function assertNonNegativeInt(value: number, label = 'value'): void {
  assertSafeInt(value, label);
  if (value < 0) throw new RangeError(`${label} não pode ser negativo (recebido: ${value})`);
}

/**
 * Divisão inteira com arredondamento para baixo, exata para todo o intervalo
 * de inteiros seguros (corrige o raro erro de arredondamento de `a / b`).
 */
export function idiv(a: number, b: number): number {
  assertNonNegativeInt(a, 'dividendo');
  assertSafeInt(b, 'divisor');
  if (b <= 0) throw new RangeError(`divisor deve ser positivo (recebido: ${b})`);
  let q = Math.floor(a / b);
  while (q * b > a) q -= 1;
  while ((q + 1) * b <= a) q += 1;
  return q;
}

/** floor(a * b / c) sem perda de precisão, usando BigInt quando o produto excede 2^53. */
export function mulDiv(a: number, b: number, c: number): number {
  assertNonNegativeInt(a, 'a');
  assertNonNegativeInt(b, 'b');
  const product = a * b;
  if (Number.isSafeInteger(product)) return idiv(product, c);
  assertSafeInt(c, 'c');
  if (c <= 0) throw new RangeError(`divisor deve ser positivo (recebido: ${c})`);
  const result = (BigInt(a) * BigInt(b)) / BigInt(c);
  const asNumber = Number(result);
  assertSafeInt(asNumber, 'resultado de mulDiv');
  return asNumber;
}

/** Aplica um multiplicador em basis points: floor(value * bp / 10_000). */
export function applyBp(value: number, bp: number): number {
  return mulDiv(value, bp, BP);
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
