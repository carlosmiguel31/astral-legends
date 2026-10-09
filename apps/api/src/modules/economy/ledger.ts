import { AppError } from '../../http/errors.js';
import {
  Prisma,
  type Currency,
  type LedgerReason,
  type PrismaClient,
} from '../../generated/prisma/client.js';

/** Limite de segurança por lançamento (evita overflow e erros de digitação administrativos). */
export const MAX_ABS_DELTA = 1_000_000_000_000n;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_\-.]{8,128}$/;

export interface LedgerInput {
  accountId: string;
  currency: Currency;
  /** Positivo = crédito, negativo = débito. Nunca zero. */
  delta: bigint;
  reason: LedgerReason;
  /** Chave estável derivada da operação de origem (ex.: `hunt:<id>:enc:<n>:gold`). */
  idempotencyKey: string;
  refType?: string;
  refId?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface LedgerResult {
  entryId: bigint;
  balanceAfter: bigint;
  /** true quando a chave já havia sido processada e nada foi alterado agora. */
  replayed: boolean;
}

export class InsufficientFundsError extends AppError {
  constructor() {
    super(409, 'INSUFFICIENT_FUNDS', 'Saldo insuficiente');
  }
}

export class IdempotencyConflictError extends AppError {
  constructor() {
    super(409, 'IDEMPOTENCY_CONFLICT', 'Chave de idempotência já usada com parâmetros diferentes');
  }
}

type Tx = Prisma.TransactionClient;
type ExistingEntry = {
  id: bigint;
  accountId: string;
  currency: Currency;
  delta: bigint;
  reason: LedgerReason;
  balanceAfter: bigint;
};

function validate(input: LedgerInput): void {
  if (input.delta === 0n) throw new AppError(400, 'INVALID_AMOUNT', 'Valor não pode ser zero');
  const abs = input.delta < 0n ? -input.delta : input.delta;
  if (abs > MAX_ABS_DELTA)
    throw new AppError(400, 'INVALID_AMOUNT', 'Valor acima do limite permitido');
  if (!IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)) {
    throw new AppError(400, 'INVALID_IDEMPOTENCY_KEY', 'Chave de idempotência inválida');
  }
}

function replay(existing: ExistingEntry, input: LedgerInput): LedgerResult {
  const same =
    existing.accountId === input.accountId &&
    existing.currency === input.currency &&
    existing.delta === input.delta &&
    existing.reason === input.reason;
  if (!same) throw new IdempotencyConflictError();
  return { entryId: existing.id, balanceAfter: existing.balanceAfter, replayed: true };
}

function findByKey(db: PrismaClient | Tx, idempotencyKey: string): Promise<ExistingEntry | null> {
  return db.ledgerEntry.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      accountId: true,
      currency: true,
      delta: true,
      reason: true,
      balanceAfter: true,
    },
  });
}

function isIdempotencyKeyViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
    return false;
  // Com driver adapters o alvo pode vir em formatos diferentes; checamos o texto do meta.
  return JSON.stringify(error.meta ?? {}).includes('idempotency_key');
}

/**
 * Aplica um lançamento dentro de uma transação já aberta. Use esta variante
 * para compor com outras mutações atômicas (ex.: debitar ouro e aprimorar item).
 * Em caso de chave repetida concorrente, a transação inteira é abortada pelo
 * índice único; o chamador deve tratar com idempotência de operação.
 */
export async function applyLedgerEntryInTx(tx: Tx, input: LedgerInput): Promise<LedgerResult> {
  validate(input);
  const existing = await findByKey(tx, input.idempotencyKey);
  if (existing) return replay(existing, input);

  const key = { accountId: input.accountId, currency: input.currency };
  // INSERT ... ON CONFLICT DO NOTHING: cria a carteira com saldo zero se ainda não existir.
  await tx.walletBalance.createMany({ data: [{ ...key, amount: 0n }], skipDuplicates: true });

  // UPDATE condicional e atômico: o Postgres reavalia o WHERE após obter o lock da linha,
  // então débitos concorrentes nunca deixam o saldo negativo.
  const updated = await tx.walletBalance.updateMany({
    where: input.delta < 0n ? { ...key, amount: { gte: -input.delta } } : key,
    data: { amount: { increment: input.delta } },
  });
  if (updated.count !== 1) throw new InsufficientFundsError();

  const wallet = await tx.walletBalance.findUniqueOrThrow({
    where: { accountId_currency: key },
    select: { amount: true },
  });

  const entry = await tx.ledgerEntry.create({
    data: {
      ...key,
      delta: input.delta,
      balanceAfter: wallet.amount,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
    select: { id: true },
  });
  return { entryId: entry.id, balanceAfter: wallet.amount, replayed: false };
}

/** Aplica um lançamento isolado em sua própria transação, com idempotência completa. */
export async function applyLedgerEntry(
  db: PrismaClient,
  input: LedgerInput,
): Promise<LedgerResult> {
  validate(input);
  const existing = await findByKey(db, input.idempotencyKey);
  if (existing) return replay(existing, input);
  try {
    return await db.$transaction((tx) => applyLedgerEntryInTx(tx, input));
  } catch (error) {
    // Duas requisições simultâneas com a mesma chave: a segunda perde no índice único.
    if (isIdempotencyKeyViolation(error)) {
      const winner = await findByKey(db, input.idempotencyKey);
      if (winner) return replay(winner, input);
    }
    throw error;
  }
}

export async function getBalance(
  db: PrismaClient,
  accountId: string,
  currency: Currency,
): Promise<bigint> {
  const wallet = await db.walletBalance.findUnique({
    where: { accountId_currency: { accountId, currency } },
    select: { amount: true },
  });
  return wallet?.amount ?? 0n;
}
