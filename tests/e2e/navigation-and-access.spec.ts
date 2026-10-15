import { test, expect, type Page } from './auth-fixture';

async function openAdminAccess(page: Page) {
  await page.goto('/login');
  const logo = page.getByRole('button', { name: 'QuickBite', exact: true });
  await expect(logo).toBeVisible();
  const box = await logo.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(2_600);
  await page.mouse.up();
  const dialog = page.getByRole('dialog', { name: 'Acceso interno' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /administraci[oó]n/i }).click();
}

const publicRoutes = [
  { path: '/', heading: /iniciar sesi[oó]n|bienvenido|quickbite/i },
  { path: '/login', heading: /iniciar sesi[oó]n|bienvenido|quickbite/i },
  { path: '/register-student', heading: /registr|cuenta/i },
  { path: '/forgot-password', heading: /recuper|contrase[nñ]a/i },
];

test.describe('public navigation @student', () => {
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

test('protected admin feature center does not expose admin UI to an anonymous visitor @student', async ({ page }) => {
  await page.goto('/admin/features');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('body')).toBeVisible();
  await expect(page.getByText(/centro de funcionalidades/i)).not.toBeVisible();
  await expect.poll(() => new URL(page.url()).pathname).not.toBe('/admin/features');
});

test('retired staff URLs do not expose an operational interface @student', async ({ page }) => {
  for (const path of ['/staff', '/staff/orders']) {
    await page.goto(path);
    await expect.poll(() => new URL(page.url()).pathname).not.toBe(path);
    await expect(page.getByRole('heading', { name: /operación de cafetería|cola de pedidos/i })).toHaveCount(0);
  }
});

test('admin feature center smoke test when admin E2E credentials are configured @admin', async ({ page }) => {
  test.skip(
    !process.env.PLAYWRIGHT_ADMIN_EMAIL || !process.env.PLAYWRIGHT_ADMIN_PASSWORD,
    'Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD to enable authenticated admin E2E coverage.',
  );
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await openAdminAccess(page);
  await page.locator('#login-email').fill(process.env.PLAYWRIGHT_ADMIN_EMAIL!);
  await page.locator('#login-password').fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: /^iniciar sesi[oó]n$/i }).click();
  await page.waitForURL((url) => url.pathname === '/admin' || url.pathname === '/admin/');
  await page.goto('/admin/features');
  await expect(page.getByText(/centro de funcionalidades/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/operaci[oó]n diaria/i)).toBeVisible();
  await expect(page.getByText(/cat[aá]logo e inventario/i)).toBeVisible();
  await expect(page.getByText(/usuarios y beneficios/i)).toBeVisible();
  await expect(page.getByText(/an[aá]lisis y trazabilidad/i)).toBeVisible();
  await expect(page.getByText(/sistema y mantenimiento/i)).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('admin user management no longer advertises the retired Staff role @admin', async ({ page }) => {
  test.skip(
    !process.env.PLAYWRIGHT_ADMIN_EMAIL || !process.env.PLAYWRIGHT_ADMIN_PASSWORD,
    'Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD to enable authenticated admin E2E coverage.',
  );
  await openAdminAccess(page);
  await page.locator('#login-email').fill(process.env.PLAYWRIGHT_ADMIN_EMAIL!);
  await page.locator('#login-password').fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: /^iniciar sesi[oó]n$/i }).click();
  await page.waitForURL((url) => url.pathname === '/admin' || url.pathname === '/admin/');
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /crear staff/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /crear usuario/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /crear padre de familia/i })).toBeVisible();
});
