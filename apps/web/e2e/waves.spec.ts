import { expect, test, type Page } from '@playwright/test';
import { rewindHunt } from './db';
import { createCharacter, register } from './helpers';

const MIN = 60_000;

async function startHunting(page: Page) {
  await register(page);
  const name = await createCharacter(page);
  await page.getByRole('button', { name: 'Caçar em Campos do Alvorecer' }).click();
  await expect(page.getByTestId('hud-status')).toContainText('Caçando · Avançar');
  return name;
}

async function currentWave(page: Page): Promise<number> {
  const text = (await page.getByTestId('wave-current').textContent()) ?? '';
  return Number(/Wave (\d+)/.exec(text)?.[1] ?? 0);
}

async function clearedCount(page: Page): Promise<number> {
  return Number(await page.getByTestId('wave-cleared').getAttribute('data-value'));
}

test.describe('waves', () => {
  test('modo Avançar: conclui waves sozinho, libera as próximas e mostra o resumo', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const name = await startHunting(page);

    // Estado inicial: wave 1, contagem zerada, próximas waves bloqueadas.
    await expect(page.getByTestId('wave-current')).toContainText('Wave 1');
    await expect(page.getByTestId('mode-advance')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('wave-option-2')).toBeDisabled();
    await expect(page.getByTestId('wave-option-5')).toHaveAttribute('title', /conclua a wave 4/);
    await expect(page.getByTestId('wave-next')).toHaveText('Ao concluir, avança para a wave 2.');
    await expect(page.getByTestId('wave-first-clear')).toContainText('1ª conclusão');
    await expect(page.getByTestId('hud-wave')).toContainText('Wave 1');

    // 10 minutos offline: o servidor liquida várias waves de uma vez.
    await rewindHunt(name, 10 * MIN);
    await page.reload();
    await expect(page.getByTestId('offline-waves')).toContainText(/waves? concluídas?/);
    await expect.poll(() => currentWave(page)).toBeGreaterThan(1);
    const wave = await currentWave(page);
    // Concluídas = wave atual − 1 (ou = wave atual, se o nível segurou o avanço).
    expect([wave - 1, wave]).toContain(await clearedCount(page));
    await expect(page.getByTestId('wave-option-2')).toBeEnabled();
    await expect(page.getByTestId(`wave-option-${(await clearedCount(page)) + 2}`)).toBeDisabled();
    await expect(page.getByTestId('wave-progress')).toBeVisible();

    // Conclusão ao vivo: com a página aberta, mais tempo passa e o aviso aparece.
    await rewindHunt(name, 10 * MIN);
    await expect(page.getByTestId('wave-feedback')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('wave-feedback')).toContainText(/Wave \d+ concluída!/);

    // O histórico registra cada conclusão.
    await page.getByRole('tab', { name: 'Histórico' }).click();
    const clears = page.getByTestId('history-wave-clears');
    await expect(clears.getByText('Wave 1', { exact: true })).toBeVisible();
    await expect(clears.getByText(/1ª conclusão/).first()).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('modo Farmar: repete a wave escolhida sem perder progresso nem pagar de novo', async ({
    page,
  }) => {
    const name = await startHunting(page);
    await rewindHunt(name, 10 * MIN);
    await page.reload();
    await expect.poll(() => currentWave(page)).toBeGreaterThan(2);
    const highest = await clearedCount(page);

    // Alterna para Farmar: a wave e as vitórias são mantidas.
    const wins = await page.getByTestId('wave-wins').textContent();
    await page.getByTestId('mode-farm').click();
    await expect(page.getByTestId('mode-farm')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('hud-status')).toContainText('Caçando · Farmar');
    expect(await page.getByTestId('wave-wins').textContent()).toBe(wins);

    // Escolhe a wave 1 para farmar: a contagem recomeça nela.
    await page.getByTestId('wave-option-1').click();
    await expect(page.getByTestId('wave-current')).toContainText('Wave 1');
    await expect(page.getByTestId('wave-next')).toHaveText('Ao concluir, repete a wave 1.');
    await expect(page.getByTestId('wave-first-clear')).toHaveCount(0);

    // Waves ainda não liberadas continuam bloqueadas.
    await expect(page.getByTestId(`wave-option-${highest + 2}`)).toBeDisabled();

    await rewindHunt(name, 10 * MIN);
    await page.reload();
    await expect(page.getByTestId('offline-waves')).toBeVisible();
    await expect(page.getByTestId('wave-current')).toContainText('Wave 1');
    await expect(page.getByTestId('mode-farm')).toHaveAttribute('aria-pressed', 'true');
    expect(await clearedCount(page)).toBe(highest);
    // Repetições não trazem recompensa de primeira conclusão.
    await expect(page.getByTestId('offline-waves')).not.toContainText('pela primeira vez');

    await page.getByRole('tab', { name: 'Histórico' }).click();
    await expect(page.getByTestId('history-wave-clears').getByText('Farmar').first()).toBeVisible();

    // Volta a avançar a partir da wave escolhida (os modos ficam na aba Caça).
    await page.getByRole('tab', { name: 'Caça' }).click();
    await page.getByTestId('mode-advance').click();
    await expect(page.getByTestId('hud-status')).toContainText('Caçando · Avançar');
  });
});
