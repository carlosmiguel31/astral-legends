import { expect, test } from '@playwright/test';

test.describe('página inicial', () => {
  test('mostra o título e o estado real do servidor', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Astral Legends' })).toBeVisible();
    await expect(page.getByTestId('status-api')).toHaveText(/pronta/);
    await expect(page.getByTestId('status-db')).toHaveText(/online/);
    await expect(page.getByTestId('status-redis')).toHaveText(/online/);
    await expect(page.getByTestId('status-realtime')).toHaveText(/conectado · \d+ ms/);
  });

  test('carrega as classes a partir da API', async ({ page }) => {
    await page.goto('/');
    const classes = page.getByTestId('classes');
    await expect(classes.getByRole('heading', { level: 3 })).toHaveText([
      'Guardião Astral',
      'Arcanista Celestial',
      'Lâmina Estelar',
    ]);
  });

  test('renderiza o canvas do Phaser sem erros no console', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    const canvas = page.getByTestId('game-canvas').locator('canvas');
    await expect(canvas).toHaveCount(1);
    const box = await canvas.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(200);
    await page.waitForTimeout(1_500);
    expect(errors).toEqual([]);
  });
});
