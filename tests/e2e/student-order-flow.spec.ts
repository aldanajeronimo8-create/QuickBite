import { test, expect } from '@playwright/test';

const email = process.env.PLAYWRIGHT_E2E_EMAIL;
const password = process.env.PLAYWRIGHT_E2E_PASSWORD;

test.describe('student purchase flow', () => {
  test.skip(!email || !password, 'Set PLAYWRIGHT_E2E_EMAIL and PLAYWRIGHT_E2E_PASSWORD to run the real Supabase purchase flow.');

  test('student can login, add a product, submit an order and see it in history', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Correo electrónico').first().fill(email!);
    await page.getByLabel('Contraseña').first().fill(password!);
    await page.getByRole('button', { name: 'Ver menú' }).click();

    await expect(page).toHaveURL(/\/menu$/);
    await expect(page.getByRole('heading', { name: /Pide ahora, recoge sin fila/i })).toBeVisible();

    const addButton = page.getByRole('button', { name: 'Agregar', exact: true }).first();
    await expect(addButton).toBeVisible();
    await addButton.click();

    await page.getByRole('button', { name: /Ver pedido/i }).click();
    await expect(page.getByRole('heading', { name: 'Tu pedido' })).toBeVisible();
    await page.getByRole('button', { name: /Continuar al pago/i }).click();

    await expect(page.getByRole('heading', { name: 'Confirmar pago' })).toBeVisible();
    await page.getByRole('button', { name: /Enviar para aprobación/i }).click();

    await expect(page.getByRole('heading', { name: 'Recibo digital' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Pago pendiente de aprobación/i)).toBeVisible();
    await page.getByRole('button', { name: 'Ver historial' }).click();

    await expect(page.getByText(/Pedido enviado|pendiente de aprobación/i).first()).toBeVisible();
  });
});
