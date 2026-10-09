import {
  MAX_LEVEL,
  OFFLINE_CAP_MS,
  RULESET_VERSION,
  deriveBuild,
  xpToNextLevel,
} from '@astral/game-core';
import { appearanceSchema, type Appearance, type GameState } from '@astral/shared';
import type { AppConfig } from '../../config/env.js';
import { notFound } from '../../http/errors.js';
import type { Character, Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { itemView, toEquipped } from './views.js';

export type Db = PrismaClient | Prisma.TransactionClient;

const DEFAULT_APPEARANCE: Appearance = { hair: 0, skin: 0, cloak: 0 };

export function characterNotFound() {
  return notFound('CHARACTER_NOT_FOUND', 'Crie seu personagem para começar a jogar');
}

/**
 * Trava a linha do personagem até o fim da transação (SELECT … FOR UPDATE).
 * Toda operação que altera personagem, caça ou inventário passa por aqui, o que
 * serializa requisições simultâneas da mesma conta (várias abas, cliques repetidos).
 */
export async function lockCharacter(
  tx: Prisma.TransactionClient,
  accountId: string,
): Promise<Character> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM characters WHERE account_id = ${accountId}::uuid FOR UPDATE`;
  const id = rows[0]?.id;
  if (!id) throw characterNotFound();
  return tx.character.findUniqueOrThrow({ where: { id } });
}

export function parseAppearance(raw: unknown): Appearance {
  const parsed = appearanceSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_APPEARANCE;
}

/** Monta o estado persistido do jogador. Leitura pura: não liquida a caça. */
export async function loadGameState(
  db: Db,
  accountId: string,
  config: AppConfig,
  now: Date,
): Promise<GameState> {
  const character = await db.character.findUnique({ where: { accountId } });
  if (!character) throw characterNotFound();

  const [equippedRows, inventoryCount, balances, hunt] = await Promise.all([
    db.itemInstance.findMany({
      where: { ownerCharacterId: character.id, equippedSlot: { not: null } },
      orderBy: { equippedSlot: 'asc' },
    }),
    db.itemInstance.count({ where: { ownerCharacterId: character.id, equippedSlot: null } }),
    db.walletBalance.findMany({ where: { accountId } }),
    db.huntSession.findUnique({ where: { characterId: character.id } }),
  ]);

  const build = deriveBuild({
    classId: character.classId,
    affinity: character.affinity,
    level: character.level,
    equipment: equippedRows.map(toEquipped),
  });
  const balance = (currency: 'GOLD' | 'ESSENCE' | 'DIAMOND') =>
    (balances.find((b) => b.currency === currency)?.amount ?? 0n).toString();

  return {
    serverTime: now.toISOString(),
    rulesetVersion: RULESET_VERSION,
    character: {
      id: character.id,
      name: character.name,
      classId: character.classId,
      affinity: character.affinity,
      appearance: parseAppearance(character.appearance),
      level: character.level,
      xp: character.xp,
      xpToNext: xpToNextLevel(character.level),
      maxLevel: MAX_LEVEL,
    },
    attributes: build.attributes,
    stats: build.stats,
    wallet: { gold: balance('GOLD'), essence: balance('ESSENCE'), diamonds: balance('DIAMOND') },
    hunt: hunt
      ? {
          status: hunt.status,
          regionId: hunt.regionId,
          runId: hunt.runId,
          startedAt: hunt.startedAt.toISOString(),
          lastSettledAt: hunt.lastSettledAt.toISOString(),
          encountersResolved: hunt.encountersResolved,
          offlineCapMs: OFFLINE_CAP_MS,
        }
      : null,
    equipment: equippedRows.map((row) => itemView(row, character.classId, character.level)),
    inventory: { count: inventoryCount, capacity: config.INVENTORY_CAPACITY },
  };
}
