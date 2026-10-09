import { gameStateSchema, inventoryResponseSchema } from '@astral/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { heroName } from './db.js';
import { Browser, createHero, registerUser, setupApp, type TestContext } from './support.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await setupApp();
});

afterAll(async () => {
  await ctx.close();
});

const appearance = { hair: 2, skin: 1, cloak: 4 };

describe('criação de personagem', () => {
  it('conta nova ainda não tem personagem', async () => {
    const user = await registerUser(ctx.app);
    const res = await user.browser.get('/v1/game/state');
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('CHARACTER_NOT_FOUND');
  });

  it('cria com atributos definidos pelo servidor e arma inicial no inventário', async () => {
    const user = await registerUser(ctx.app);
    const name = heroName('Aurélia');
    const res = await user.browser.post('/v1/characters', {
      name,
      classId: 'guardian',
      affinity: 'lunar',
      appearance,
    });
    expect(res.statusCode).toBe(201);
    const state = gameStateSchema.parse(res.json());
    expect(state.character).toMatchObject({ name, classId: 'guardian', affinity: 'lunar', level: 1, xp: 0, appearance });
    // Mesmos números do game-core para um Guardião Lunar nível 1.
    expect(state.stats).toMatchObject({ maxHp: 170, attack: 16, defense: 10, critChanceBp: 880 });
    expect(state.attributes).toEqual({ str: 8, int: 3, agi: 4, vit: 12 });
    expect(state.wallet).toEqual({ gold: '0', essence: '0', diamonds: '0' });
    expect(state.equipment).toEqual([]);

    const inventory = inventoryResponseSchema.parse((await user.browser.get('/v1/inventory')).json());
    expect(inventory.items).toHaveLength(1);
    expect(inventory.items[0]).toMatchObject({
      defId: 'maca-do-juramento',
      rarity: 'common',
      equipped: false,
      usable: true,
    });
    expect((await user.browser.get('/v1/auth/me')).json().account.hasCharacter).toBe(true);
  });

  it('rejeita nome, classe, afinidade e aparência inválidos com erro por campo', async () => {
    const user = await registerUser(ctx.app);
    const base = { name: heroName(), classId: 'blade', affinity: 'storm', appearance };
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...base, name: 'A' }, 'name'],
      [{ ...base, name: 'Nome<script>' }, 'name'],
      [{ ...base, name: 'Dois Nomes' }, 'name'],
      [{ ...base, classId: 'necromante' }, 'classId'],
      [{ ...base, affinity: 'fogo' }, 'affinity'],
      [{ ...base, appearance: { hair: 99, skin: 0, cloak: 0 } }, 'appearance.hair'],
    ];
    for (const [payload, field] of cases) {
      const res = await user.browser.post('/v1/characters', payload);
      expect(res.statusCode, field).toBe(400);
      expect(Object.keys(res.json().error.fields), field).toContain(field);
    }
    expect(await ctx.prisma.character.count({ where: { accountId: user.accountId } })).toBe(0);
  });

  it('não aceita atributos, nível ou itens enviados pelo cliente', async () => {
    const user = await registerUser(ctx.app);
    const res = await user.browser.post('/v1/characters', {
      name: heroName(),
      classId: 'blade',
      affinity: 'storm',
      appearance,
      level: 30,
      stats: { attack: 9999 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('nomes são únicos sem diferenciar maiúsculas e acentos', async () => {
    const first = await registerUser(ctx.app);
    const name = heroName('Estrela');
    await first.browser.post('/v1/characters', { name, classId: 'blade', affinity: 'storm', appearance });

    const second = await registerUser(ctx.app);
    const variant = name.toUpperCase().replace('E', 'É');
    const res = await second.browser.post('/v1/characters', {
      name: variant,
      classId: 'arcanist',
      affinity: 'solar',
      appearance,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('NAME_TAKEN');
  });

  it('nomes reservados são recusados', async () => {
    const user = await registerUser(ctx.app);
    const res = await user.browser.post('/v1/characters', {
      name: 'Administrador',
      classId: 'blade',
      affinity: 'storm',
      appearance,
    });
    expect(res.statusCode).toBe(422);
  });

  it('um personagem por conta, mesmo com requisições simultâneas', async () => {
    const user = await registerUser(ctx.app);
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        user.browser.post('/v1/characters', {
          name: heroName(),
          classId: 'blade',
          affinity: 'storm',
          appearance,
        }),
      ),
    );
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(3);
    expect(await ctx.prisma.character.count({ where: { accountId: user.accountId } })).toBe(1);
    expect(
      await ctx.prisma.itemInstance.count({ where: { owner: { accountId: user.accountId } } }),
    ).toBe(1);
  });

  it('criar personagem exige sessão', async () => {
    const res = await new Browser(ctx.app).post('/v1/characters', {
      name: heroName(),
      classId: 'blade',
      affinity: 'storm',
      appearance,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('inventário', () => {
  it('equipar aumenta os atributos efetivos e persiste; desequipar desfaz', async () => {
    const user = await registerUser(ctx.app);
    const before = await createHero(user, 'blade');
    const [starter] = (await user.browser.get('/v1/inventory')).json().items;

    const equipped = await user.browser.post(`/v1/inventory/${starter.id}/equip`);
    expect(equipped.statusCode).toBe(200);
    const state = equipped.json().state;
    // Adaga do Cometa: +3 ataque e +1 agilidade.
    expect(state.stats.attack).toBe(before.stats.attack + 3);
    expect(state.attributes.agi).toBe(before.attributes.agi + 1);
    expect(state.equipment.map((i: { defId: string }) => i.defId)).toEqual(['adaga-do-cometa']);

    // Persistência: outra sessão (login novo) vê o mesmo equipamento.
    const other = new Browser(ctx.app);
    await other.post('/v1/auth/login', { email: user.email, password: user.password });
    expect((await other.get('/v1/game/state')).json().equipment).toHaveLength(1);

    const unequipped = await user.browser.post(`/v1/inventory/${starter.id}/unequip`);
    expect(unequipped.statusCode).toBe(200);
    expect(unequipped.json().state.stats.attack).toBe(before.stats.attack);
    expect(unequipped.json().state.equipment).toEqual([]);
  });

  it('equipar novamente o mesmo item é idempotente', async () => {
    const user = await registerUser(ctx.app);
    await createHero(user);
    const [starter] = (await user.browser.get('/v1/inventory')).json().items;
    await user.browser.post(`/v1/inventory/${starter.id}/equip`);
    const again = await user.browser.post(`/v1/inventory/${starter.id}/equip`);
    expect(again.statusCode).toBe(200);
    expect(again.json().state.equipment).toHaveLength(1);
  });

  it('itens de outro jogador são invisíveis e intocáveis (404)', async () => {
    const owner = await registerUser(ctx.app);
    await createHero(owner);
    const [item] = (await owner.browser.get('/v1/inventory')).json().items;

    const thief = await registerUser(ctx.app);
    await createHero(thief);
    for (const action of ['equip', 'unequip']) {
      const res = await thief.browser.post(`/v1/inventory/${item.id}/${action}`);
      expect(res.statusCode, action).toBe(404);
    }
    expect((await thief.browser.delete(`/v1/inventory/${item.id}`)).statusCode).toBe(404);
    const stored = await ctx.prisma.itemInstance.findUniqueOrThrow({ where: { id: item.id } });
    expect(stored.equippedSlot).toBeNull();
    expect((await thief.browser.get('/v1/inventory')).json().items.map((i: { id: string }) => i.id)).not.toContain(
      item.id,
    );
  });

  it('impede equipar item de outra classe ou acima do nível', async () => {
    const user = await registerUser(ctx.app);
    const state = await createHero(user, 'blade');
    const make = (defId: string) =>
      ctx.prisma.itemInstance.create({
        data: {
          ownerCharacterId: state.character.id,
          defId,
          rarity: 'rare',
          bonuses: { stats: { attack: 5 } },
          rulesetVersion: 2,
          source: 'ADMIN',
        },
      });
    const staff = await make('varinha-de-orvalho');
    const sabre = await make('sabre-de-mare');
    const classRes = await user.browser.post(`/v1/inventory/${staff.id}/equip`);
    expect(classRes.statusCode).toBe(422);
    expect(classRes.json().error.message).toMatch(/classe/);
    const levelRes = await user.browser.post(`/v1/inventory/${sabre.id}/equip`);
    expect(levelRes.statusCode).toBe(422);
    expect(levelRes.json().error.message).toMatch(/nível 6/);
  });

  it('equipar dois itens do mesmo slot ao mesmo tempo deixa apenas um equipado', async () => {
    const user = await registerUser(ctx.app);
    const state = await createHero(user, 'blade');
    const helmets = await Promise.all(
      [1, 2, 3].map((n) =>
        ctx.prisma.itemInstance.create({
          data: {
            ownerCharacterId: state.character.id,
            defId: 'elmo-de-cobre-estelar',
            rarity: 'common',
            bonuses: { stats: { defense: n } },
            rulesetVersion: 2,
            source: 'ADMIN',
          },
        }),
      ),
    );
    const results = await Promise.all(helmets.map((h) => user.browser.post(`/v1/inventory/${h.id}/equip`)));
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    const equipped = await ctx.prisma.itemInstance.count({
      where: { ownerCharacterId: state.character.id, equippedSlot: 'head' },
    });
    expect(equipped).toBe(1);
  });

  it('descarta itens do inventário com registro de auditoria; equipados não', async () => {
    const user = await registerUser(ctx.app);
    await createHero(user);
    const [starter] = (await user.browser.get('/v1/inventory')).json().items;
    await user.browser.post(`/v1/inventory/${starter.id}/equip`);
    expect((await user.browser.delete(`/v1/inventory/${starter.id}`)).statusCode).toBe(409);

    await user.browser.post(`/v1/inventory/${starter.id}/unequip`);
    expect((await user.browser.delete(`/v1/inventory/${starter.id}`)).statusCode).toBe(204);
    expect(await ctx.prisma.itemInstance.findUnique({ where: { id: starter.id } })).toBeNull();
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { targetId: starter.id } });
    expect(audit).toMatchObject({ action: 'item.discard', actorId: user.accountId });
  });

  it('ids malformados são recusados antes de consultar o banco', async () => {
    const user = await registerUser(ctx.app);
    await createHero(user);
    const res = await user.browser.post(`/v1/inventory/nao-e-uuid/equip`);
    expect(res.statusCode).toBe(400);
  });
});
