import { test, expect, type Page } from './auth-fixture';

type Role = 'student' | 'parent' | 'admin';

const HOME: Record<Role, string> = {
  student: '/menu',
  parent: '/parent/family',
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

async function persistThemePreference(page: Page, desired: 'light' | 'dark') {
  const light = page.getByRole('radio', { name: /claro/i });
  const dark = page.getByRole('radio', { name: /oscuro/i });
  const desiredControl = desired === 'light' ? light : dark;
  const oppositeControl = desired === 'light' ? dark : light;
  const opposite = desired === 'light' ? 'dark' : 'light';
  const isThemeSave = (response: { url: () => string; request: () => { method: () => string } }) =>
    response.url().includes('/rest/v1/rpc/set_my_theme_preference') &&
    response.request().method() === 'POST';

  await expect(desiredControl).toBeVisible();
  await expect(desiredControl).toBeEnabled();

  // Test runs share the destination account between CI executions. If it already
  // has the requested preference, change to the opposite mode first so this test
  // still validates a real database write instead of only an optimistic UI update.
  if (await desiredControl.getAttribute('aria-checked') === 'true') {
    const oppositeSave = page.waitForResponse(isThemeSave);
    await oppositeControl.click();
    const oppositeResponse = await oppositeSave;
    expect(oppositeResponse.status(), 'opposite theme preference must persist').toBe(200);
    await expect.poll(() => page.locator('html').getAttribute('data-qb-theme')).toBe(opposite);
  }

  const save = page.waitForResponse(isThemeSave);
  await desiredControl.click();
  const response = await save;
  expect(response.status(), `saving ${desired} theme preference must succeed`).toBe(200);
  await expect.poll(() => page.locator('html').getAttribute('data-qb-theme')).toBe(desired);
}

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

test.describe('QuickBite production acceptance — role coverage @student', () => {
  test('all four roles reach their correct production interface', async ({ page, e2eAuth }) => {
    for (const role of ['student', 'parent', 'admin'] as const) {
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

test.describe('QuickBite production acceptance — security matrix @student', () => {
  test('anonymous users are denied from every protected role surface', async ({ page }) => {
    for (const route of [
      '/menu',
      '/student/account',
      '/student/history',
      '/parent/family',
      '/admin',
      '/admin/users',
      '/admin/orders',
    ]) {
      await page.goto(route);
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).not.toBe(route);
    }
  });

  test('student and parent cannot enter admin surfaces', async ({ browser, e2eAuth }) => {
    for (const role of ['student', 'parent'] as const) {
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

test.describe('QuickBite production acceptance — persistence and UX @student', () => {
  test('theme preference is account-specific and survives logout', async ({ browser, e2eAuth }) => {
    const student = await browser.newPage();
    await e2eAuth.login(student, 'student');
    await student.goto('/student/account');
    await assertNoRuntimeFailures(student);

    await persistThemePreference(student, 'light');

    // Mi cuenta no contiene el control de cierre de sesión. El logout real del estudiante
    // está en el header de /menu, que es el mismo control usado por el flujo crítico.
    await student.goto('/menu');
    await expect.poll(() => student.locator('html').getAttribute('data-qb-theme')).toBe('light');
    await student.getByRole('button', { name: /cerrar sesión/i }).first().click();
    await student.waitForURL(/\/login$/);
    await expect.poll(() => student.locator('html').getAttribute('data-qb-theme')).toBe('light');
    await student.close();

    const parent = await browser.newPage();
    await e2eAuth.login(parent, 'parent');
    await parent.goto('/parent/family');
    await persistThemePreference(parent, 'dark');
    await parent.goto('/menu');
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
    await e2eAuth.login(page, 'student');
    const logout = page.getByRole('button', { name: /cerrar sesión/i }).first();
    await expect(logout).toBeVisible();
    await logout.click();
    await page.waitForURL(/\/login$/);
    await page.goto('/menu');
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).not.toBe('/menu');
  });
});
