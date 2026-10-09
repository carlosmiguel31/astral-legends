import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/infra/prisma.js';
import {
  IdempotencyConflictError,
  InsufficientFundsError,
  applyLedgerEntry,
  getBalance,
} from '../../src/modules/economy/ledger.js';
import { createAccount, key, testPrisma } from './db.js';

let prisma: PrismaClient;

beforeAll(() => {
  prisma = testPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('livro-razão', () => {
  it('credita e debita registrando o saldo após cada lançamento', async () => {
    const accountId = await createAccount(prisma);
    const credit = await applyLedgerEntry(prisma, {
      accountId,
      currency: 'GOLD',
      delta: 150n,
      reason: 'HUNT_REWARD',
      idempotencyKey: key('credit'),
    });
    expect(credit).toMatchObject({ balanceAfter: 150n, replayed: false });

    const debit = await applyLedgerEntry(prisma, {
      accountId,
      currency: 'GOLD',
      delta: -40n,
      reason: 'ITEM_UPGRADE',
      idempotencyKey: key('debit'),
    });
    expect(debit.balanceAfter).toBe(110n);
    expect(await getBalance(prisma, accountId, 'GOLD')).toBe(110n);
    expect(await getBalance(prisma, accountId, 'DIAMOND')).toBe(0n);
  });

  it('recusa débito acima do saldo sem registrar nada', async () => {
    const accountId = await createAccount(prisma);
    await expect(
      applyLedgerEntry(prisma, {
        accountId,
        currency: 'ESSENCE',
        delta: -1n,
        reason: 'ITEM_UPGRADE',
        idempotencyKey: key('overdraft'),
      }),
    ).rejects.toBeInstanceOf(InsufficientFundsError);
    expect(await prisma.ledgerEntry.count({ where: { accountId } })).toBe(0);
  });

  it('é idempotente: repetir a mesma chave não altera o saldo', async () => {
    const accountId = await createAccount(prisma);
    const input = {
      accountId,
      currency: 'GOLD' as const,
      delta: 25n,
      reason: 'HUNT_REWARD' as const,
      idempotencyKey: key('replay'),
    };
    const first = await applyLedgerEntry(prisma, input);
    const second = await applyLedgerEntry(prisma, input);
    expect(second).toEqual({ ...first, replayed: true });
    expect(await getBalance(prisma, accountId, 'GOLD')).toBe(25n);
  });

  it('detecta reuso da chave com parâmetros diferentes', async () => {
    const accountId = await createAccount(prisma);
    const idempotencyKey = key('conflict');
    await applyLedgerEntry(prisma, {
      accountId,
      currency: 'GOLD',
      delta: 10n,
      reason: 'HUNT_REWARD',
      idempotencyKey,
    });
    await expect(
      applyLedgerEntry(prisma, {
        accountId,
        currency: 'GOLD',
        delta: 999n,
        reason: 'HUNT_REWARD',
        idempotencyKey,
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it('a mesma chave enviada em paralelo é aplicada uma única vez', async () => {
    const accountId = await createAccount(prisma);
    const input = {
      accountId,
      currency: 'GOLD' as const,
      delta: 7n,
      reason: 'HUNT_REWARD' as const,
      idempotencyKey: key('parallel-same-key'),
    };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => applyLedgerEntry(prisma, input)),
    );
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(await getBalance(prisma, accountId, 'GOLD')).toBe(7n);
    expect(await prisma.ledgerEntry.count({ where: { accountId } })).toBe(1);
  });

  it('débitos concorrentes nunca deixam o saldo negativo', async () => {
    const accountId = await createAccount(prisma);
    await applyLedgerEntry(prisma, {
      accountId,
      currency: 'GOLD',
      delta: 100n,
      reason: 'DEV_SEED',
      idempotencyKey: key('seed'),
    });
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        applyLedgerEntry(prisma, {
          accountId,
          currency: 'GOLD',
          delta: -30n,
          reason: 'ITEM_UPGRADE',
          idempotencyKey: key(`spend-${i}`),
        }),
      ),
    );
    const ok = attempts.filter((a) => a.status === 'fulfilled');
    const failed = attempts.filter((a) => a.status === 'rejected');
    expect(ok).toHaveLength(3);
    for (const f of failed)
      expect((f as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientFundsError);
    expect(await getBalance(prisma, accountId, 'GOLD')).toBe(10n);

    // O saldo é sempre igual à soma do livro-razão.
    const sum = await prisma.ledgerEntry.aggregate({
      where: { accountId, currency: 'GOLD' },
      _sum: { delta: true },
    });
    expect(sum._sum.delta).toBe(10n);
  });

  it('valida valores e chaves antes de tocar no banco', async () => {
    const accountId = await createAccount(prisma);
    const base = { accountId, currency: 'GOLD' as const, reason: 'HUNT_REWARD' as const };
    await expect(
      applyLedgerEntry(prisma, { ...base, delta: 0n, idempotencyKey: key('zero') }),
    ).rejects.toMatchObject({
      code: 'INVALID_AMOUNT',
    });
    await expect(
      applyLedgerEntry(prisma, { ...base, delta: 10n ** 13n, idempotencyKey: key('huge') }),
    ).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
    await expect(
      applyLedgerEntry(prisma, { ...base, delta: 1n, idempotencyKey: 'curta' }),
    ).rejects.toMatchObject({
      code: 'INVALID_IDEMPOTENCY_KEY',
    });
  });
});
