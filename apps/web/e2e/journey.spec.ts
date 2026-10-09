import { expect, test } from '@playwright/test';
import { PASSWORD, createCharacter, currentXp, register, uniqueUser } from './helpers';

test.describe('jornada principal', () => {
  test('cadastro → personagem → caça → XP → equipar → recarregar → progresso recuperado', async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await register(page);
    const name = await createCharacter(page);

    // Estado inicial definido pelo servidor.
    await expect(page.getByTestId('hud-level')).toHaveText('Nv 1');
    await expect(page.getByTestId('hud-xp')).toHaveText('0/100');
    await expect(page.getByTestId('hud-gold')).toHaveText('0');
    await expect(page.getByTestId('hud-status')).toContainText('Descansando');
    await expect(page.getByTestId('game-canvas').locator('canvas')).toHaveCount(1);

    // Inicia a caçada; os encontros são liquidados no servidor e reproduzidos aqui.
    await page.getByRole('button', { name: 'Caçar em Campos do Alvorecer' }).click();
    await expect(page.getByTestId('hud-status')).toContainText('Caçando');
    await expect(page.getByTestId('hud-region')).toHaveText('Campos do Alvorecer');

    // Primeiro monstro derrotado (confirmado pelo servidor). Um encontro pode levar até
    // ~30 s (monstro mais forte + recuperação), e a animação reproduz o combate inteiro.
    await expect.poll(() => currentXp(page), { timeout: 90_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId('hud-gold')).not.toHaveText('0');
    const feed = page.getByTestId('combat-feed');
    await expect(feed.getByText('Vitória').first()).toBeVisible({ timeout: 60_000 });
    const xpBefore = await currentXp(page);
    const goldBefore = await page.getByTestId('hud-gold').textContent();

    // Atributos antes do equipamento.
    await page.getByRole('tab', { name: 'Atributos' }).click();
    const attackBefore = Number(await page.getByTestId('stat-Ataque').textContent());

    // Equipa a arma inicial: o ataque efetivo aumenta (calculado pelo servidor).
    await page.getByRole('tab', { name: 'Inventário' }).click();
    const dagger = page.getByTestId('item-adaga-do-cometa');
    await dagger.getByRole('button', { name: 'Equipar' }).click();
    await expect(dagger.getByRole('button', { name: 'Desequipar' })).toBeVisible();
    await page.getByRole('tab', { name: 'Atributos' }).click();
    await expect(page.getByTestId('stat-Ataque')).toHaveText(String(attackBefore + 3));

    // Atualiza a página: tudo vem do servidor (cookies HttpOnly mantêm a sessão).
    await page.reload();
    await expect(page.getByTestId('hud-name')).toHaveText(name);
    await expect(page.getByTestId('hud-status')).toContainText('Caçando');
    await expect.poll(() => currentXp(page)).toBeGreaterThanOrEqual(xpBefore);
    await expect(page.getByTestId('hud-gold')).not.toHaveText('0');
    expect(goldBefore).not.toBe('0');
    await page.getByRole('tab', { name: 'Inventário' }).click();
    await expect(
      page.getByTestId('item-adaga-do-cometa').getByRole('button', { name: 'Desequipar' }),
    ).toBeVisible();

    // Uma segunda aba mostra o mesmo estado persistido.
    const second = await context.newPage();
    await second.goto('/');
    await expect(second.getByTestId('hud-name')).toHaveText(name);
    await expect(second.getByTestId('hud-level')).toHaveText(
      (await page.getByTestId('hud-level').textContent())!,
    );
    await second.close();

    // Nenhum token acessível ao JavaScript.
    expect(await page.evaluate(() => document.cookie)).toBe('');
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toMatch(/al_|token/i);

    expect(errors).toEqual([]);
  });

  test('parar a caçada mantém o progresso', async ({ page }) => {
    await register(page);
    await createCharacter(page);
    await page.getByRole('button', { name: 'Caçar em Campos do Alvorecer' }).click();
    await expect.poll(() => currentXp(page), { timeout: 90_000 }).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Parar caçada' }).click();
    await expect(page.getByTestId('hud-status')).toContainText('Descansando');
    const xp = await currentXp(page);
    await page.reload();
    await expect(page.getByTestId('hud-status')).toContainText('Descansando');
    expect(await currentXp(page)).toBe(xp);
  });

  test('regiões acima do nível ficam bloqueadas', async ({ page }) => {
    await register(page);
    await createCharacter(page);
    await expect(page.getByText('🔒 Alcance o nível 6')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Caçar em Bosque das Marés de Prata' }),
    ).toHaveCount(0);
  });
});

test.describe('autenticação', () => {
  test('mostra erros de validação por campo no cadastro', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Criar conta' }).click();
    await page.getByLabel('Nome de usuário').fill('a');
    await page.getByLabel('E-mail').fill('nao-e-email');
    await page.getByLabel('Senha', { exact: true }).fill('curta');
    await page.getByLabel('Confirmar senha').fill('outra');
    await page.getByRole('button', { name: 'Criar conta e entrar' }).click();
    await expect(page.getByText('Use de 3 a 16 caracteres: letras, números ou _')).toBeVisible();
    await expect(page.getByText('E-mail inválido')).toBeVisible();
    await expect(page.getByText('A senha precisa ter pelo menos 10 caracteres')).toBeVisible();
  });

  test('login inválido mostra mensagem genérica; logout encerra a sessão', async ({ page }) => {
    const user = await register(page, uniqueUser());
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('tab', { name: 'Entrar' })).toBeVisible();

    await page.getByLabel('E-mail').fill(user.email);
    await page.getByLabel('Senha').fill('senha-errada-123');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos');

    await page.getByLabel('Senha').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Desperte seu guerreiro' })).toBeVisible();

    // Depois do logout, recarregar não restaura a sessão.
    await page.getByRole('button', { name: 'Sair' }).click();
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Entrar' })).toBeVisible();
  });
});
