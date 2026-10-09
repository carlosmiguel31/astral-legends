/**
 * Formatação para exibição. Usa aritmética inteira para manter a mesma
 * representação exata dos valores calculados pelo servidor.
 */

function withComma(whole: number, frac: number, fracDigits: number): string {
  const fracStr = String(frac).padStart(fracDigits, '0').replace(/0+$/, '');
  return fracStr.length > 0 ? `${whole},${fracStr}` : String(whole);
}

/** 880 bp → "8,8%". */
export function formatBp(bp: number): string {
  const sign = bp < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(bp));
  return `${sign}${withComma(Math.floor(abs / 100), abs % 100, 2)}%`;
}

/** 1581 ms → "1,58 s" (arredonda para baixo em centésimos). */
export function formatSeconds(ms: number): string {
  const abs = Math.abs(Math.trunc(ms));
  return `${withComma(Math.floor(abs / 1000), Math.floor((abs % 1000) / 10), 2)} s`;
}
