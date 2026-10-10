import { expect, test } from '@playwright/test';
import { createCharacter, register } from './helpers';

test('jogo utilizável no celular, sem rolagem horizontal', async ({ page }) => {
  await register(page);
  await createCharacter(page);
  await page.getByRole('button', { name: 'Caçar em Campos do Alvorecer' }).click();
  await expect(page.getByTestId('hud-status')).toContainText('Caçando');
  await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // No celular os painéis abrem em folhas a partir da barra inferior.
  await page.getByRole('button', { name: 'Inventário' }).click();
  await expect(page.getByTestId('inventory-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Personagem' }).click();
  await expect(page.getByTestId('stats-panel')).toBeVisible();
});

test('painel de waves cabe no celular e o modo pode ser trocado pelo toque', async ({ page }) => {
  await register(page);
  await createCharacter(page);
  await page.getByRole('button', { name: 'Caçar em Campos do Alvorecer' }).click();
  const panel = page.getByTestId('wave-panel');
  await panel.scrollIntoViewIfNeeded();
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('wave-selector').getByRole('button')).toHaveCount(10);

  await page.getByTestId('mode-farm').tap();
  await expect(page.getByTestId('mode-farm')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('hud-status')).toContainText('Farmar');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/mobile-waves.png', fullPage: true });
});
