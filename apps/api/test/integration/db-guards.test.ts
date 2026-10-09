import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/infra/prisma.js';
import { applyLedgerEntry } from '../../src/modules/economy/ledger.js';
import { createAccount, key, testPrisma } from './db.js';

let prisma: PrismaClient;

beforeAll(() => {
  prisma = testPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('garantias no banco (defesa em profundidade)', () => {
  it('livro-razão é append-only: UPDATE e DELETE são bloqueados', async () => {
    const accountId = await createAccount(prisma);
    const { entryId } = await applyLedgerEntry(prisma, {
      accountId,
      currency: 'GOLD',
      delta: 5n,
      reason: 'HUNT_REWARD',
      idempotencyKey: key('append-only'),
    });
    await expect(
      prisma.$executeRaw`UPDATE ledger_entries SET delta = 999 WHERE id = ${entryId}`,
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.$executeRaw`DELETE FROM ledger_entries WHERE id = ${entryId}`,
    ).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRaw`TRUNCATE ledger_entries`).rejects.toThrow(/append-only/);
  });

  it('auditoria é append-only', async () => {
    const log = await prisma.auditLog.create({
      data: { actorType: 'system', action: 'test.event' },
    });
    await expect(
      prisma.auditLog.update({ where: { id: log.id }, data: { action: 'adulterado' } }),
    ).rejects.toThrow();
  });

  it('saldo negativo é impossível mesmo com SQL direto', async () => {
    const accountId = await createAccount(prisma);
    await expect(
      prisma.$executeRaw`INSERT INTO wallet_balances (account_id, currency, amount, updated_at) VALUES (${accountId}::uuid, 'GOLD', -1, now())`,
    ).rejects.toThrow(/wallet_balances_amount_non_negative/);
  });

  it('só um item por slot equipado e aprimoramento limitado', async () => {
    const accountId = await createAccount(prisma);
    const character = await prisma.character.create({
      data: {
        accountId,
        name: 'Teste',
        nameKey: `teste-${Date.now()}`,
        classId: 'blade',
        affinity: 'storm',
        appearance: { hair: 0, skin: 0, cloak: 0 },
      },
    });
    const item = {
      ownerCharacterId: character.id,
      defId: 'espada-de-teste',
      rarity: 'common' as const,
      bonuses: {},
      rulesetVersion: 1,
      source: 'ADMIN' as const,
      equippedSlot: 'weapon' as const,
    };
    await prisma.itemInstance.create({ data: item });
    await expect(prisma.itemInstance.create({ data: item })).rejects.toThrow();
    // Vários itens no inventário (slot nulo) são permitidos.
    await prisma.itemInstance.create({ data: { ...item, equippedSlot: null } });
    await prisma.itemInstance.create({ data: { ...item, equippedSlot: null } });
    await expect(
      prisma.itemInstance.create({ data: { ...item, equippedSlot: null, upgradeLevel: 16 } }),
    ).rejects.toThrow(/upgrade_level_range/);
  });

  it('nome de personagem é único sem diferenciar maiúsculas', async () => {
    const accountId = await createAccount(prisma);
    await expect(
      prisma.character.create({
        data: {
          accountId,
          name: 'Astra',
          nameKey: 'Astra',
          classId: 'arcanist',
          affinity: 'lunar',
          appearance: { hair: 0, skin: 0, cloak: 0 },
        },
      }),
    ).rejects.toThrow(/name_key_lowercase/);
  });
});
