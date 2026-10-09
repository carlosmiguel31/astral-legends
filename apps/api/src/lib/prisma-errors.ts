import { Prisma } from '../generated/prisma/client.js';

/**
 * Se o erro for violação de unicidade (P2002), devolve um texto com o alvo
 * (nomes de colunas/constraints) para identificar qual índice falhou.
 * Com driver adapters o formato de `meta` varia; por isso serializamos tudo.
 */
export function uniqueViolation(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return null;
  return JSON.stringify(error.meta ?? {});
}
