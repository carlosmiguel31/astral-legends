import { hash, verify, type Algorithm, type Options } from '@node-rs/argon2';

/**
 * Argon2id com os parâmetros mínimos recomendados pela OWASP
 * (19 MiB de memória, 2 iterações, paralelismo 1).
 * `Algorithm` é um const enum ambiente; 2 = Argon2id.
 */
const OPTIONS: Options = {
  algorithm: 2 as Algorithm,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

let dummyHash: Promise<string> | null = null;

/**
 * Verifica a senha. Quando a conta não existe, ainda executa uma verificação
 * contra um hash fictício para que o tempo de resposta não revele se o e-mail
 * está cadastrado.
 */
export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  if (stored === null) {
    dummyHash ??= hashPassword('astral-legends-senha-ficticia');
    await verify(await dummyHash, password).catch(() => false);
    return false;
  }
  return verify(stored, password).catch(() => false);
}
