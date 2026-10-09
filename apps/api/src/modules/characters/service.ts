import {
  ITEMS,
  RULESET_VERSION,
  STARTER_WEAPON,
  createRng,
  rollItemBonuses,
} from '@astral/game-core';
import type { CreateCharacterRequest } from '@astral/shared';
import { AppError } from '../../http/errors.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { uniqueViolation } from '../../lib/prisma-errors.js';

/** Nomes que poderiam se passar por equipe do jogo. Comparação pela chave normalizada. */
const RESERVED_NAMES = new Set([
  'admin',
  'administrador',
  'moderador',
  'moderator',
  'suporte',
  'support',
  'sistema',
  'system',
  'astral',
  'astrallegends',
  'gamemaster',
  'oficial',
]);

/**
 * Chave de unicidade: sem acentos e em minúsculas ("Aurélia" e "aurelia" colidem).
 * Evita personagens visualmente idênticos.
 */
export function characterNameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export async function createCharacter(
  prisma: PrismaClient,
  accountId: string,
  input: CreateCharacterRequest,
): Promise<{ characterId: string }> {
  const nameKey = characterNameKey(input.name);
  if (RESERVED_NAMES.has(nameKey)) {
    throw new AppError(422, 'NAME_RESERVED', 'Este nome é reservado', {
      name: 'Este nome é reservado',
    });
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const character = await tx.character.create({
        data: {
          accountId,
          name: input.name,
          nameKey,
          classId: input.classId,
          affinity: input.affinity,
          appearance: input.appearance as Prisma.InputJsonObject,
        },
        select: { id: true },
      });

      // Arma inicial da classe: um item real, persistido e equipável.
      const starterId = STARTER_WEAPON[input.classId];
      const starter = ITEMS[starterId];
      if (!starter) throw new Error(`arma inicial ausente: ${starterId}`);
      await tx.itemInstance.create({
        data: {
          ownerCharacterId: character.id,
          defId: starterId,
          rarity: 'common',
          // As faixas da arma inicial são fixas; a semente não altera o resultado.
          bonuses: rollItemBonuses(starterId, 'common', createRng(0)) as Prisma.InputJsonObject,
          rulesetVersion: RULESET_VERSION,
          source: 'QUEST',
          sourceRef: `starter:${character.id}`,
          tradable: false,
        },
      });
      return { characterId: character.id };
    });
  } catch (error) {
    const target = uniqueViolation(error);
    if (target?.includes('name_key')) {
      throw new AppError(409, 'NAME_TAKEN', 'Já existe um personagem com este nome', {
        name: 'Já existe um personagem com este nome',
      });
    }
    if (target?.includes('account_id')) {
      throw new AppError(409, 'CHARACTER_EXISTS', 'Sua conta já possui um personagem');
    }
    throw error;
  }
}
