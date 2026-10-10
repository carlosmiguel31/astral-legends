import {
  createCharacterRequestSchema,
  huntSettingsRequestSchema,
  itemIdParamsSchema,
  startHuntRequestSchema,
  type GameState,
  type HuntHistoryResponse,
  type InventoryResponse,
  type StateChangeReason,
  type SyncResponse,
} from '@astral/shared';
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import { authOf } from '../../http/guards.js';
import { parseInput } from '../../http/errors.js';
import type { Character, Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { RealtimeHub } from '../../realtime/hub.js';
import { createCharacter } from '../characters/service.js';
import {
  changeHuntSettings,
  recentEncounters,
  settleActiveHunt,
  settlementHistory,
  startHunt,
  stopHunt,
  waveClearHistory,
  type SettleOutcome,
} from '../hunt/service.js';
import { waveClearView } from '../hunt/waves.js';
import { discardItem, equipItem, listInventory, unequipItem } from '../inventory/service.js';
import { characterNotFound, loadGameState, lockCharacter } from './state.js';
import { settlementView } from './views.js';

export interface GameRoutesOptions {
  config: AppConfig;
  prisma: PrismaClient;
  requireAuth: preHandlerAsyncHookHandler;
  hub: RealtimeHub;
}

const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

export async function gameRoutes(app: FastifyInstance, opts: GameRoutesOptions): Promise<void> {
  const { config, prisma, requireAuth, hub } = opts;

  /** Executa `fn` numa transação com o personagem da conta travado. */
  function withCharacter<T>(
    accountId: string,
    fn: (tx: Prisma.TransactionClient, c: Character) => Promise<T>,
  ) {
    return prisma.$transaction(
      async (tx) => fn(tx, await lockCharacter(tx, accountId)),
      TX_OPTIONS,
    );
  }

  async function syncBody(accountId: string, settle: SettleOutcome | null): Promise<SyncResponse> {
    const now = new Date();
    const state = await loadGameState(prisma, accountId, config, now);
    return {
      state,
      settlement: settle ? settlementView(settle.settlement) : null,
      recentEncounters: await recentEncounters(
        prisma,
        state.character.id,
        settle?.encounters ?? [],
      ),
      waveClears: (settle?.waveClears ?? []).map(waveClearView),
    };
  }

  function notify(accountId: string, reason: StateChangeReason): void {
    hub.publish(accountId, { type: 'state.changed', reason });
  }

  const rate = (max: number) => ({ config: { rateLimit: { max, timeWindow: '1 minute' } } });

  app.addHook('preHandler', requireAuth);

  // ── Estado ───────────────────────────────────────────────────────────────
  app.get('/v1/game/state', async (request) => {
    const body: GameState = await loadGameState(
      prisma,
      authOf(request).accountId,
      config,
      new Date(),
    );
    return body;
  });

  // ── Personagem ───────────────────────────────────────────────────────────
  app.post('/v1/characters', rate(20), async (request, reply) => {
    const { accountId } = authOf(request);
    const input = parseInput(createCharacterRequestSchema, request.body);
    await createCharacter(prisma, accountId, input);
    notify(accountId, 'character');
    return reply.status(201).send(await loadGameState(prisma, accountId, config, new Date()));
  });

  // ── Caça ─────────────────────────────────────────────────────────────────
  app.post('/v1/hunt/sync', rate(120), async (request) => {
    const { accountId } = authOf(request);
    const settle = await withCharacter(accountId, (tx, c) =>
      settleActiveHunt(tx, c, config, new Date()),
    );
    if (settle) notify(accountId, 'hunt');
    return syncBody(accountId, settle);
  });

  app.post('/v1/hunt/start', rate(30), async (request) => {
    const { accountId } = authOf(request);
    const input = parseInput(startHuntRequestSchema, request.body);
    const result = await withCharacter(accountId, (tx, c) =>
      startHunt(tx, c, input, config, { now: new Date(), requestId: request.id }),
    );
    if (result.changed || result.settle) notify(accountId, 'hunt');
    return syncBody(accountId, result.settle);
  });

  app.post('/v1/hunt/settings', rate(60), async (request) => {
    const { accountId } = authOf(request);
    const input = parseInput(huntSettingsRequestSchema, request.body);
    const result = await withCharacter(accountId, (tx, c) =>
      changeHuntSettings(tx, c, input, config, { now: new Date(), requestId: request.id }),
    );
    if (result.changed || result.settle) notify(accountId, 'hunt');
    return syncBody(accountId, result.settle);
  });

  app.post('/v1/hunt/stop', rate(30), async (request) => {
    const { accountId } = authOf(request);
    const result = await withCharacter(accountId, (tx, c) =>
      stopHunt(tx, c, config, { now: new Date(), requestId: request.id }),
    );
    if (result.changed || result.settle) notify(accountId, 'hunt');
    return syncBody(accountId, result.settle);
  });

  app.get('/v1/hunt/history', async (request) => {
    const { accountId } = authOf(request);
    const character = await prisma.character.findUnique({
      where: { accountId },
      select: { id: true },
    });
    if (!character) throw characterNotFound();
    const body: HuntHistoryResponse = {
      settlements: await settlementHistory(prisma, character.id),
      recentEncounters: await recentEncounters(prisma, character.id),
      waveClears: await waveClearHistory(prisma, character.id),
    };
    return body;
  });

  // ── Inventário ───────────────────────────────────────────────────────────
  app.get('/v1/inventory', async (request) => {
    const { accountId } = authOf(request);
    const character = await prisma.character.findUnique({ where: { accountId } });
    if (!character) throw characterNotFound();
    const body: InventoryResponse = {
      items: await listInventory(prisma, character),
      capacity: config.INVENTORY_CAPACITY,
    };
    return body;
  });

  app.post('/v1/inventory/:itemId/equip', rate(60), async (request) => {
    const { accountId } = authOf(request);
    const { itemId } = parseInput(itemIdParamsSchema, request.params);
    const result = await withCharacter(accountId, (tx, c) =>
      equipItem(tx, c, itemId, config, { now: new Date(), requestId: request.id }),
    );
    if (result.changed || result.settle) notify(accountId, 'inventory');
    return syncBody(accountId, result.settle);
  });

  app.post('/v1/inventory/:itemId/unequip', rate(60), async (request) => {
    const { accountId } = authOf(request);
    const { itemId } = parseInput(itemIdParamsSchema, request.params);
    const result = await withCharacter(accountId, (tx, c) =>
      unequipItem(tx, c, itemId, config, { now: new Date(), requestId: request.id }),
    );
    if (result.changed || result.settle) notify(accountId, 'inventory');
    return syncBody(accountId, result.settle);
  });

  app.delete('/v1/inventory/:itemId', rate(60), async (request, reply) => {
    const { accountId } = authOf(request);
    const { itemId } = parseInput(itemIdParamsSchema, request.params);
    await withCharacter(accountId, (tx, c) =>
      discardItem(tx, c, itemId, config, { now: new Date(), requestId: request.id }),
    );
    notify(accountId, 'inventory');
    return reply.status(204).send();
  });
}
