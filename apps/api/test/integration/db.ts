import { randomUUID } from 'node:crypto';
import { createPrisma, type PrismaClient } from '../../src/infra/prisma.js';
import { TEST_DATABASE_URL } from '../helpers.js';

export function testPrisma(): PrismaClient {
  return createPrisma(TEST_DATABASE_URL);
}

/** Conta criada direto no banco (para testes de camada de dados). */
export async function createAccount(prisma: PrismaClient): Promise<string> {
  const username = `u_${randomUUID().slice(0, 8)}`;
  const account = await prisma.account.create({
    data: {
      username,
      usernameKey: username.toLowerCase(),
      email: `jogador-${randomUUID()}@teste.local`,
      passwordHash: 'hash-de-teste-nao-utilizavel',
    },
    select: { id: true },
  });
  return account.id;
}

export function key(label: string): string {
  return `test:${label}:${randomUUID()}`;
}

/** Nome de personagem único (apenas letras). */
export function heroName(prefix = 'Heroi'): string {
  const letters = randomUUID()
    .replace(/[^a-f]/g, '')
    .slice(0, 8);
  return `${prefix}${letters}`.slice(0, 16);
}
