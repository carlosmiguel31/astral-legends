import { expect, test } from '@playwright/test';
import { createCharacter, register } from './helpers';

test.describe('interface (Fase 2B)', () => {
  test('módulos futuros ficam desabilitados e os implementados abrem janelas sem sair do jogo', async ({
    page,
  }) => {
    await register(page);
    await createCharacter(page);

    // Nada fictício: os módulos não implementados estão desabilitados e marcados.
    for (const name of ['Conquistas', 'Rankings', 'Chefes', 'PvP', 'Mercado', 'Passe']) {
      await expect(page.getByRole('button', { name: `${name} (em breve)` })).toBeDisabled();
    }
    await expect(page.getByRole('button', { name: 'Configurações (em breve)' })).toBeDisabled();

    // O chat é só um espaço reservado: sem mensagens e sem envio.
    const chat = page.getByTestId('chat-panel');
    await expect(chat.getByText('Chat em breve')).toBeVisible();
    await expect(chat.getByRole('textbox')).toBeDisabled();
    await expect(chat.getByRole('tab', { name: 'Mundo' })).toBeDisabled();

    // Personagem abre numa janela sobre o jogo; Esc fecha e o jogo continua ali.
    await page.getByRole('button', { name: 'Personagem', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Personagem' });
    await expect(dialog.getByTestId('stats-panel')).toBeVisible();
    await expect(dialog.getByRole('img', { name: /Arma: vazio/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('game-canvas').locator('canvas')).toHaveCount(1);

    // O mapa lista as regiões, com as bloqueadas indicando o requisito.
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
    const map = page.getByRole('dialog', { name: 'Mapa' });
    await expect(map.getByRole('button', { name: 'Ver Bosque das Marés de Prata' })).toBeVisible();
    await expect(map.getByText('🔒 Alcance o nível 12')).toBeVisible();
    await map.getByRole('button', { name: 'Fechar' }).click();
  });

  test('equipar e desequipar refletem nos atributos e nos slots do personagem', async ({
    page,
  }) => {
    await register(page);
    await createCharacter(page);
    await page.getByRole('tab', { name: 'Atributos' }).click();
    const attack = Number(await page.getByTestId('stat-Ataque').textContent());

    await page.getByRole('tab', { name: 'Inventário' }).click();
    const dagger = page.getByTestId('item-adaga-do-cometa');
    await dagger.getByRole('button', { name: 'Equipar' }).click();
    await expect(dagger.getByRole('button', { name: 'Desequipar' })).toBeVisible();

    await page.getByRole('tab', { name: 'Atributos' }).click();
    await expect(page.getByTestId('stat-Ataque')).toHaveText(String(attack + 3));
    await expect(page.getByRole('img', { name: /Arma: Adaga do Cometa/ })).toBeVisible();

    await page.getByRole('tab', { name: 'Inventário' }).click();
    await dagger.getByRole('button', { name: 'Desequipar' }).click();
    await expect(dagger.getByRole('button', { name: 'Equipar' })).toBeVisible();
    await page.getByRole('tab', { name: 'Atributos' }).click();
    await expect(page.getByTestId('stat-Ataque')).toHaveText(String(attack));
  });

  test('reconecta sozinho depois de perder a conexão', async ({ page, context }) => {
    await register(page);
    await createCharacter(page);
    await page.getByRole('button', { name: 'Caçar em Campos do Alvorecer' }).click();
    await expect(page.getByTestId('hud-realtime')).toHaveAttribute('data-status', 'online', {
      timeout: 15_000,
    });

    await context.setOffline(true);
    await expect(page.getByTestId('connection-error')).toBeVisible({ timeout: 20_000 });
    // (o Chromium offline não derruba o WebSocket já aberto; o aviso vem da sincronização HTTP)

    await context.setOffline(false);
    await expect(page.getByTestId('connection-error')).toBeHidden({ timeout: 30_000 });
    await expect(page.getByTestId('hud-realtime')).toHaveAttribute('data-status', 'online', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('hud-status')).toContainText('Caçando');
  });
});
