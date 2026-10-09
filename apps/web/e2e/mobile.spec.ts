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

  await page.getByRole('tab', { name: 'Inventário' }).click();
  await expect(page.getByTestId('inventory-panel')).toBeVisible();
});
