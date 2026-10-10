import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'senha-muito-segura-123';

export function uniqueUser() {
  const id = Math.random().toString(16).slice(2, 10);
  return { username: `e2e_${id}`, email: `e2e_${id}@teste.local` };
}

/** Nome de personagem só com letras. */
export function heroName(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let suffix = '';
  for (let i = 0; i < 8; i += 1) suffix += letters[Math.floor(Math.random() * letters.length)];
  return `Lyra${suffix}`;
}

export async function register(page: Page, user = uniqueUser()) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Criar conta' }).click();
  await page.getByLabel('Nome de usuário').fill(user.username);
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirmar senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar conta e entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Desperte seu guerreiro' })).toBeVisible();
  return user;
}

export async function createCharacter(page: Page, name = heroName()) {
  await page.getByLabel('Nome do personagem').fill(name);
  await page.getByRole('radio', { name: /Lâmina Estelar/ }).click();
  await page.getByRole('radio', { name: /^Lunar/ }).click();
  await page.getByRole('button', { name: 'Cabelo 5' }).click();
  await page.getByRole('button', { name: 'Criar personagem' }).click();
  await expect(page.getByTestId('hud-name')).toHaveText(name);
  return name;
}

/** "1.026 / 1.300 (78%)" → 1026 (a HUD separa milhares com ponto). */
export async function currentXp(page: Page): Promise<number> {
  const text = (await page.getByTestId('hud-xp').textContent()) ?? '0/0';
  return Number(text.split('/')[0]!.replace(/\D/g, ''));
}
