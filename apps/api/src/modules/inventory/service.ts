import { canEquip } from '@astral/game-core';
import type { ItemView } from '@astral/shared';
import type { AppConfig } from '../../config/env.js';
import { AppError, notFound } from '../../http/errors.js';
import type { Character, Prisma, PrismaClient } from '../../generated/prisma/client.js';
import {
  applyCommandBoundary,
  recordCommand,
  settleActiveHunt,
  type CommandContext,
  type SettleOutcome,
} from '../hunt/service.js';
import { itemDefOrThrow, itemView } from '../game/views.js';

type Tx = Prisma.TransactionClient;

const itemNotFound = () => notFound('ITEM_NOT_FOUND', 'Item não encontrado');

export async function listInventory(
  prisma: PrismaClient,
  character: Pick<Character, 'id' | 'classId' | 'level'>,
): Promise<ItemView[]> {
  const items = await prisma.itemInstance.findMany({
    where: { ownerCharacterId: character.id },
    orderBy: [{ equippedSlot: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
  });
  return items.map((i) => itemView(i, character.classId, character.level));
}

/**
 * Busca o item SEMPRE filtrando pelo dono. Um id de item de outro jogador
 * responde 404 — igual a um id inexistente, para não revelar que existe.
 */
async function ownedItem(tx: Tx, character: Character, itemId: string) {
  const item = await tx.itemInstance.findFirst({
    where: { id: itemId, ownerCharacterId: character.id },
  });
  if (!item) throw itemNotFound();
  return item;
}

/**
 * Fronteira de comando para mudanças de equipamento (ADR-08): o encontro em andamento
 * recomeça agora, já com o novo equipamento, e a troca fica registrada em `hunt_commands`.
 */
async function equipmentBoundary(
  tx: Tx,
  characterId: string,
  slot: string,
  from: string | null,
  to: string | null,
  ctx: CommandContext,
): Promise<void> {
  const hunt = await applyCommandBoundary(tx, characterId, ctx.now);
  if (!hunt) return;
  await recordCommand(tx, {
    characterId,
    regionId: hunt.regionId,
    runId: hunt.runId,
    command: 'equipment',
    atEncounter: hunt.atEncounter,
    from: { slot, itemId: from },
    to: { slot, itemId: to },
    ctx,
  });
}

/**
 * Equipa um item no slot da sua definição, trocando o que estiver lá.
 * A caçada é liquidada antes: encontros passados usam o equipamento antigo.
 */
export async function equipItem(
  tx: Tx,
  character: Character,
  itemId: string,
  config: AppConfig,
  ctx: CommandContext,
): Promise<{ settle: SettleOutcome | null; changed: boolean }> {
  const settle = await settleActiveHunt(tx, character, config, ctx.now);
  const fresh = await tx.character.findUniqueOrThrow({ where: { id: character.id } });
  const item = await ownedItem(tx, fresh, itemId);
  const def = itemDefOrThrow(item.defId);

  const check = canEquip(def, fresh.classId, fresh.level);
  if (!check.usable) {
    const message =
      check.reason === 'level'
        ? `Requer nível ${def.minLevel}`
        : 'Sua classe não pode usar este item';
    throw new AppError(422, 'ITEM_NOT_USABLE', message);
  }
  if (item.equippedSlot === def.slot) return { settle, changed: false };

  const previous = await tx.itemInstance.findFirst({
    where: { ownerCharacterId: fresh.id, equippedSlot: def.slot },
    select: { id: true },
  });
  await tx.itemInstance.updateMany({
    where: { ownerCharacterId: fresh.id, equippedSlot: def.slot },
    data: { equippedSlot: null, version: { increment: 1 } },
  });
  const updated = await tx.itemInstance.updateMany({
    where: { id: item.id, ownerCharacterId: fresh.id, version: item.version },
    data: { equippedSlot: def.slot, version: { increment: 1 } },
  });
  if (updated.count !== 1)
    throw new AppError(409, 'ITEM_CONFLICT', 'O item foi alterado; tente novamente');
  await equipmentBoundary(tx, fresh.id, def.slot, previous?.id ?? null, item.id, ctx);
  return { settle, changed: true };
}

export async function unequipItem(
  tx: Tx,
  character: Character,
  itemId: string,
  config: AppConfig,
  ctx: CommandContext,
): Promise<{ settle: SettleOutcome | null; changed: boolean }> {
  const settle = await settleActiveHunt(tx, character, config, ctx.now);
  const item = await ownedItem(tx, character, itemId);
  if (item.equippedSlot === null) return { settle, changed: false };
  const slot = item.equippedSlot;

  const unequippedCount = await tx.itemInstance.count({
    where: { ownerCharacterId: character.id, equippedSlot: null },
  });
  if (unequippedCount >= config.INVENTORY_CAPACITY) {
    throw new AppError(409, 'INVENTORY_FULL', 'Inventário cheio: descarte algum item primeiro');
  }
  const updated = await tx.itemInstance.updateMany({
    where: { id: item.id, ownerCharacterId: character.id, version: item.version },
    data: { equippedSlot: null, version: { increment: 1 } },
  });
  if (updated.count !== 1)
    throw new AppError(409, 'ITEM_CONFLICT', 'O item foi alterado; tente novamente');
  await equipmentBoundary(tx, character.id, slot, item.id, null, ctx);
  return { settle, changed: true };
}

/** Descarta um item do inventário (não equipado). Fica registrado na auditoria. */
export async function discardItem(
  tx: Tx,
  character: Character,
  itemId: string,
  config: AppConfig,
  ctx: CommandContext,
): Promise<{ settle: SettleOutcome | null }> {
  // Liquida antes: a vaga liberada só vale para drops de encontros que terminarem depois.
  // Sem isso, descartar antes de sincronizar salvaria drops que um jogador que consulta
  // com frequência já teria perdido (resultado dependente da frequência de consulta).
  const settle = await settleActiveHunt(tx, character, config, ctx.now);
  const item = await ownedItem(tx, character, itemId);
  if (item.equippedSlot !== null) {
    throw new AppError(409, 'ITEM_EQUIPPED', 'Desequipe o item antes de descartá-lo');
  }
  await tx.itemInstance.delete({ where: { id: item.id } });
  await tx.auditLog.create({
    data: {
      actorType: 'account',
      actorId: character.accountId,
      action: 'item.discard',
      targetType: 'item_instance',
      targetId: item.id,
      payload: {
        defId: item.defId,
        rarity: item.rarity,
        source: item.source,
        sourceRef: item.sourceRef,
      },
      requestId: ctx.requestId ?? null,
    },
  });
  return { settle };
}
