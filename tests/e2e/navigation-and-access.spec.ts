import { test, expect } from '@playwright/test';

const publicRoutes = [
  { path: '/', heading: /iniciar sesi[oó]n|bienvenido|quickbite/i },
  { path: '/login', heading: /iniciar sesi[oó]n|bienvenido|quickbite/i },
  { path: '/register-student', heading: /registr|cuenta/i },
  { path: '/forgot-password', heading: /recuper|contrase[nñ]a/i },
];

test.describe('public navigation', () => {
  for (const route of publicRoutes) {
    test(`loads ${route.path} without a fatal page error`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });

      await page.goto(route.path);
      await expect(page.locator('body')).toBeVisible();
      await expect(page.locator('body')).toContainText(route.heading);
      expect(consoleErrors).toEqual([]);
    });
  }
});

test('protected admin feature center does not expose admin UI to an anonymous visitor', async ({ page }) => {
  await page.goto('/admin/features');
  await page.waitForLoadState('domcontentloaded');

  await expect(page.locator('body')).toBeVisible();
  await expect(page.getByText(/centro de funcionalidades/i)).not.toBeVisible();
  await expect(page).toHaveURL(/\/login$|\/$/);
});

test('admin feature center smoke test when admin E2E credentials are configured', async ({ page }) => {
  test.skip(
    !process.env.PLAYWRIGHT_ADMIN_EMAIL || !process.env.PLAYWRIGHT_ADMIN_PASSWORD,
    'Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD to enable authenticated admin E2E coverage.',
  );

  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/login');
  await page.getByRole('button', { name: /acceso de administraci[oó]n/i }).click();
  await page.getByLabel(/correo|email/i).fill(process.env.PLAYWRIGHT_ADMIN_EMAIL!);
  await page.getByLabel(/contrase[nñ]a|password/i).fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();

  await page.waitForURL(/\/admin(?:\/)?/);
  await page.goto('/admin/features');

  await expect(page.getByText(/centro de funcionalidades/i)).toBeVisible();
  await expect(page.getByText(/operaci[oó]n diaria/i)).toBeVisible();
  await expect(page.getByText(/cat[aá]logo e inventario/i)).toBeVisible();
  await expect(page.getByText(/usuarios y beneficios/i)).toBeVisible();
  await expect(page.getByText(/an[aá]lisis y trazabilidad/i)).toBeVisible();
  await expect(page.getByText(/sistema y mantenimiento/i)).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
