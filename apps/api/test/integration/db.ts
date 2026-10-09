import { randomUUID } from 'node:crypto';
import { createPrisma, type PrismaClient } from '../../src/infra/prisma.js';
import { TEST_DATABASE_URL } from '../helpers.js';

export function testPrisma(): PrismaClient {
  return createPrisma(TEST_DATABASE_URL);
}

export async function createAccount(prisma: PrismaClient): Promise<string> {
  const account = await prisma.account.create({
    data: {
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
