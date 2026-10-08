import { test, expect, type Page } from './auth-fixture';

type Role = 'student' | 'parent' | 'staff' | 'admin';

const HOME: Record<Role, string> = {
  student: '/menu',
  parent: '/parent/family',
  staff: '/staff',
  admin: '/admin',
};

const ADMIN_ROUTES = [
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

const STUDENT_ROUTES = [
  '/menu',
  '/student/features',
  '/student/account',
  '/student/wallet',
  '/student/history',
  '/student/favorites',
  '/student/link-code',
  '/student/notifications',
  '/student/rewards',
];

async function installRole(page: Page, role: Role, e2eAuth: { install: (page: Page, role: Role) => Promise<void> }) {
  await e2eAuth.install(page, role);
  await page.goto(HOME[role]);
  await page.waitForLoadState('domcontentloaded');
}

async function assertNoRuntimeFailures(page: Page) {
  const pageErrors: string[] = [];
  const apiFailures: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', async (response) => {
    if (response.status() < 400) return;
    const url = response.url();
    if (!/\/rest\/|\/auth\/|\/functions\//.test(url)) return;
    if (response.status() === 401 && /\/auth\/v1\/user(?:$|\?)/.test(url)) return;
    let body = '';
    try { body = (await response.text()).slice(0, 250); } catch { body = '<unreadable>'; }
    apiFailures.push(`${response.status()} ${response.request().method()} ${url} ${body}`);
  });

  await expect(page.locator('body')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('body')).not.toContainText(/application error|chunkloaderror|uncaught|algo sali[oó] mal/i);
  await page.waitForTimeout(500);
  expect(pageErrors, JSON.stringify(pageErrors)).toEqual([]);
  expect(apiFailures, JSON.stringify(apiFailures)).toEqual([]);
}

test.describe('QuickBite production acceptance — role coverage', () => {
  test('all four roles reach their correct production interface', async ({ page, e2eAuth }) => {
    for (const role of ['student', 'parent', 'staff', 'admin'] as const) {
      await installRole(page, role, e2eAuth);
      await expect(page).toHaveURL(new RegExp(`${HOME[role].replaceAll('/', '\\/')}$`));
      await assertNoRuntimeFailures(page);
    }
  });

  test('student critical navigation surfaces are reachable', async ({ page, e2eAuth }) => {
    await installRole(page, 'student', e2eAuth);
    for (const route of STUDENT_ROUTES) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(`${route.replaceAll('/', '\\/')}$`));
      await assertNoRuntimeFailures(page);
    }
  });

  test('admin critical navigation surfaces are reachable', async ({ page, e2eAuth }) => {
    await installRole(page, 'admin', e2eAuth);
    for (const route of ADMIN_ROUTES) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(`${route.replaceAll('/', '\\/')}$`));
      await assertNoRuntimeFailures(page);
    }
  });

  test('staff operational interface exposes real order controls', async ({ page, e2eAuth }) => {
    await installRole(page, 'staff', e2eAuth);
    await expect(page).toHaveURL(/\/staff(?:\/)?$/);
    await expect(page.getByRole('heading', { name: 'Operación de cafetería' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cola de pedidos' })).toBeVisible();
    await assertNoRuntimeFailures(page);

    const orderLink = page.getByRole('link', { name: /pedidos|cola/i }).first();
    if (await orderLink.count()) {
      await orderLink.click();
      await expect(page).toHaveURL(/\/staff\/orders$/);
      await assertNoRuntimeFailures(page);
    }

    const actionable = page.getByRole('button').filter({ hasText: /preparar|listo|entregado|procesar|confirmar/i });
    if (await actionable.count()) {
      await expect(actionable.first()).toBeEnabled();
    }
  });

  test('parent family context is usable and does not expose admin surfaces', async ({ page, e2eAuth }) => {
    await installRole(page, 'parent', e2eAuth);
    await expect(page).toHaveURL(/\/parent\/family$/);
    await assertNoRuntimeFailures(page);

    const studentActions = page.getByRole('button').filter({ hasText: /seleccionar|usar|estudiante|entrar|ver/i });
    if (await studentActions.count()) {
      await studentActions.first().click();
      await assertNoRuntimeFailures(page);
    }

    for (const route of ['/admin', '/admin/users', '/admin/orders']) {
      await page.goto(route);
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).not.toBe(route);
    }
  });
});

test.describe('QuickBite production acceptance — security matrix', () => {
  test('anonymous users are denied from every protected role surface', async ({ page }) => {
    for (const route of [
      '/menu',
      '/student/account',
      '/student/history',
      '/parent/family',
      '/staff',
      '/staff/orders',
      '/admin',
      '/admin/users',
      '/admin/orders',
    ]) {
      await page.goto(route);
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).not.toBe(route);
    }
  });

  test('student, parent and staff cannot enter admin surfaces', async ({ browser, e2eAuth }) => {
    for (const role of ['student', 'parent', 'staff'] as const) {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await installRole(page, role, e2eAuth);
        for (const route of ['/admin', '/admin/users', '/admin/orders', '/admin/system']) {
          await page.goto(route);
          await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).not.toBe(route);
        }
      } finally {
        await context.close();
      }
    }
  });

  test('admin does not get redirected away from admin surfaces', async ({ page, e2eAuth }) => {
    await installRole(page, 'admin', e2eAuth);
    for (const route of ['/admin', '/admin/orders', '/admin/users', '/admin/system']) {
      await page.goto(route);
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).toBe(route);
    }
  });
});

test.describe('QuickBite production acceptance — persistence and UX', () => {
  test('theme preference is account-specific and survives logout', async ({ browser, e2eAuth }) => {
    const student = await browser.newPage();
    await installRole(student, 'student', e2eAuth);
    await student.goto('/student/account');
    await assertNoRuntimeFailures(student);

    const light = student.getByRole('radio', { name: /claro/i });
    await expect(light).toBeVisible();
    await light.click();
    await expect.poll(() => student.locator('html').getAttribute('data-qb-theme')).toBe('light');

    const logout = student.getByRole('button', { name: /cerrar sesión/i }).first();
    await logout.click();
    await student.waitForURL(/\/login$/);
    await expect.poll(() => student.locator('html').getAttribute('data-qb-theme')).toBe('light');
    await student.close();

    const parent = await browser.newPage();
    await installRole(parent, 'parent', e2eAuth);
    await parent.goto('/parent/family');
    const dark = parent.getByRole('radio', { name: /oscuro/i });
    await expect(dark).toBeVisible();
    await dark.click();
    await expect.poll(() => parent.locator('html').getAttribute('data-qb-theme')).toBe('dark');
    await parent.getByRole('button', { name: /cerrar sesión/i }).first().click();
    await parent.waitForURL(/\/login$/);
    await expect.poll(() => parent.locator('html').getAttribute('data-qb-theme')).toBe('dark');
    await parent.close();
  });

  test('student and admin remain usable at mobile and tablet widths', async ({ browser, e2eAuth }) => {
    for (const width of [390, 768, 1024]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await installRole(page, 'student', e2eAuth);
      await page.goto('/menu');
      await assertNoRuntimeFailures(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `student /menu horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
      await page.close();
    }

    const admin = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await installRole(admin, 'admin', e2eAuth);
    await admin.goto('/admin/orders');
    await assertNoRuntimeFailures(admin);
    const overflow = await admin.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'admin /admin/orders horizontal overflow at 390px').toBeLessThanOrEqual(1);
    await admin.close();
  });

  test('logout terminates the current role session', async ({ page, e2eAuth }) => {
    await installRole(page, 'student', e2eAuth);
    const logout = page.getByRole('button', { name: /cerrar sesión/i }).first();
    await expect(logout).toBeVisible();
    await logout.click();
    await page.waitForURL(/\/login$/);
    await page.goto('/menu');
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).not.toBe('/menu');
  });
});
