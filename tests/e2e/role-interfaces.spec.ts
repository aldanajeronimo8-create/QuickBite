import { test, expect, type Page } from './auth-fixture';

async function collectBrowserErrors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedResponses: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', async (response) => {
    if (response.status() < 400) return;
    const url = response.url();
    if (!url.includes('/rest/') && !url.includes('/auth/') && !url.includes('/functions/')) return;
    let body = '';
    try {
      body = (await response.text()).slice(0, 500);
    } catch {
      body = '<unreadable response body>';
    }
    failedResponses.push(`${response.status()} ${response.request().method()} ${url} ${body}`);
  });

  return { consoleErrors, pageErrors, failedResponses };
}

async function loginAs(page: Page, role: 'student' | 'parent' | 'staff' | 'admin', e2eAuth: { install: (page: Page, role: 'student' | 'parent' | 'staff' | 'admin') => Promise<void> }) {
  await e2eAuth.install(page, role);
  await page.goto(role === 'student' ? '/menu' : role === 'parent' ? '/parent/family' : role === 'staff' ? '/staff' : '/admin');
  await page.waitForLoadState('domcontentloaded');
}

async function assertHealthyInterface(
  page: Page,
  errors: { consoleErrors: string[]; pageErrors: string[]; failedResponses: string[] },
) {
  if (errors.failedResponses.length > 0) {
    console.log('E2E_SUPABASE_FAILURES', JSON.stringify(errors.failedResponses, null, 2));
  }
  if (errors.consoleErrors.length > 0) {
    console.log('E2E_CONSOLE_ERRORS', JSON.stringify(errors.consoleErrors, null, 2));
  }
  if (errors.pageErrors.length > 0) {
    console.log('E2E_PAGE_ERRORS', JSON.stringify(errors.pageErrors, null, 2));
  }
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/application error|uncaught|chunkloaderror|algo sali[oó] mal/i);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.failedResponses).toEqual([]);
}

test.describe('student interface @student', () => {
  test('student can authenticate and open the main interface', async ({ page, e2eAuth }) => {
    const errors = await collectBrowserErrors(page);
    await loginAs(page, 'student', e2eAuth);
    await assertHealthyInterface(page, errors);
  });

  for (const path of [
    '/menu',
    '/student/features',
    '/student/account',
    '/student/wallet',
    '/student/history',
    '/student/favorites',
    '/student/link-code',
    '/student/notifications',
    '/student/rewards',
  ]) {
    test(`student interface route ${path} loads without browser errors`, async ({ page, e2eAuth }) => {
      const errors = await collectBrowserErrors(page);
      await loginAs(page, 'student', e2eAuth);
      await page.goto(path);
      await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
      await assertHealthyInterface(page, errors);
    });
  }
});

test.describe('parent interface @parent', () => {
  test('parent can authenticate and open the family interface', async ({ page, e2eAuth }) => {
    const errors = await collectBrowserErrors(page);
    await loginAs(page, 'parent', e2eAuth);
    await assertHealthyInterface(page, errors);
    await expect(page).toHaveURL(/\/parent\/family$/);
  });

  test('parent registration interface opens without browser errors', async ({ page }) => {
    const errors = await collectBrowserErrors(page);
    await page.goto('/register-parent');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    await assertHealthyInterface(page, errors);
    await expect(page.locator('body')).toContainText(/padre|familia|registro/i);
  });
});

test.describe('staff interface @staff', () => {
  test('staff can authenticate and open the cafeteria interface', async ({ page, e2eAuth }) => {
    const errors = await collectBrowserErrors(page);
    await loginAs(page, 'staff', e2eAuth);
    await assertHealthyInterface(page, errors);
    await expect(page).toHaveURL(/\/staff(?:\/)?$/);
    await expect(page.getByRole('heading', { name: 'Operación de cafetería' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cola de pedidos' })).toBeVisible();
    for (const label of ['Pedidos', 'Menú', 'Inventario', 'Recargas', 'Conectados', 'Alérgenos', 'Historial']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Menú', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Gestión del menú' })).toBeVisible();
    await page.getByRole('button', { name: 'Inventario', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Inventario y stock' })).toBeVisible();
    await page.getByRole('button', { name: 'Recargas', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Recargas' })).toBeVisible();
    await page.getByRole('button', { name: 'Conectados', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Usuarios conectados' })).toBeVisible();
    await page.getByRole('button', { name: 'Alérgenos', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ingredientes y alérgenos' })).toBeVisible();
    await page.getByRole('button', { name: 'Historial', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Historial' })).toBeVisible();
    await assertHealthyInterface(page, errors);
  });

  test('staff orders route loads without browser errors', async ({ page, e2eAuth }) => {
    const errors = await collectBrowserErrors(page);
    await loginAs(page, 'staff', e2eAuth);
    await page.goto('/staff/orders');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    await assertHealthyInterface(page, errors);
    await expect(page).toHaveURL(/\/staff\/orders$/);
  });
});

test.describe('admin interface @admin', () => {
  const adminRoutes = [
    '/admin',
    '/admin/features',
    '/admin/orders',
    '/admin/payments',
    '/admin/wallet',
    '/admin/inventory',
    '/admin/menu',
    '/admin/verification',
    '/admin/users',
    '/admin/loyalty',
    '/admin/reports',
    '/admin/history',
    '/admin/system',
    '/admin/operations',
    '/admin/rankings',
    '/admin/reset',
  ];

  for (const path of adminRoutes) {
    test(`admin interface route ${path} loads without browser errors`, async ({ page, e2eAuth }) => {
      const errors = await collectBrowserErrors(page);
      await loginAs(page, 'admin', e2eAuth);
      await page.goto(path);
      await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
      await assertHealthyInterface(page, errors);
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).toBe(path);
    });
  }

  test('admin reports page exposes the report controls', async ({ page, e2eAuth }) => {
    const errors = await collectBrowserErrors(page);
    await loginAs(page, 'admin', e2eAuth);
    await page.goto('/admin/reports');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    await assertHealthyInterface(page, errors);
    await expect(page.getByRole('heading', { name: 'Informes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Diario', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Semanal', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mensual', exact: true })).toBeVisible();
  });

  test('admin traceability page exposes audit and cancellation sections', async ({ page, e2eAuth }) => {
    const errors = await collectBrowserErrors(page);
    await loginAs(page, 'admin', e2eAuth);
    await page.goto('/admin/history');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    await assertHealthyInterface(page, errors);
    await expect(page.getByRole('heading', { name: 'Auditoría y cancelaciones' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Solicitudes de cancelación' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Registro remoto' })).toBeVisible();
  });

  test('admin system page exposes health and operational sections', async ({ page, e2eAuth }) => {
    const errors = await collectBrowserErrors(page);
    await loginAs(page, 'admin', e2eAuth);
    await page.goto('/admin/system');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    await assertHealthyInterface(page, errors);
    await expect(page.getByRole('heading', { name: 'Salud, auditoría y automatizaciones' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Health checks' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '¿Qué hace cada módulo?' })).toBeVisible();
  });

  test('admin operations page exposes windows, inventory and ranking', async ({ page, e2eAuth }) => {
    const errors = await collectBrowserErrors(page);
    await loginAs(page, 'admin', e2eAuth);
    await page.goto('/admin/operations');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    await assertHealthyInterface(page, errors);
    await expect(page.getByRole('heading', { name: 'Control operativo' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ventanas de pedidos' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Inventario reservado' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ranking de productos' })).toBeVisible();
  });
});

test.describe('exhaustive role permission matrix @student', () => {
  const protectedRoutes = ['/menu', '/student/wallet', '/parent/family', '/staff', '/staff/orders', '/admin', '/admin/users', '/admin/orders'];

  test('staff and non-admin roles cannot reach admin surfaces', async ({ browser, e2eAuth }) => {
    for (const role of ['student', 'parent', 'staff'] as const) {
      const context = await browser.newContext();
      const rolePage = await context.newPage();
      try {
        await loginAs(rolePage, role, e2eAuth);
        for (const path of ['/admin', '/admin/users', '/admin/orders']) {
          await rolePage.goto(path);
          await rolePage.waitForLoadState('domcontentloaded');
          await expect.poll(() => new URL(rolePage.url()).pathname, { timeout: 10_000 }).not.toBe(path);
        }
      } finally {
        await context.close();
      }
    }
  });

  test('anonymous access is denied for every protected role surface', async ({ page }) => {
    for (const path of protectedRoutes) {
      await page.goto(path);
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).not.toBe(path);
    }
  });
});
