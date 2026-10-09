import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** Token opaco com 256 bits de entropia, seguro para URL/cookie. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 em hex. Tokens de alta entropia não precisam de hash lento. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Semente uint32 criptograficamente aleatória para uma caçada. */
export function randomSeed(): number {
  return randomInt(0, 0x1_0000_0000);
}
