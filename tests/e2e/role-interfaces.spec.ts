import { test, expect, type Page } from '@playwright/test';

const credentials = {
  student: () => ({
    email: process.env.PLAYWRIGHT_E2E_EMAIL,
    password: process.env.PLAYWRIGHT_E2E_PASSWORD,
  }),
  parent: () => ({
    email: process.env.PLAYWRIGHT_PARENT_EMAIL,
    password: process.env.PLAYWRIGHT_PARENT_PASSWORD,
  }),
  admin: () => ({
    email: process.env.PLAYWRIGHT_ADMIN_EMAIL,
    password: process.env.PLAYWRIGHT_ADMIN_PASSWORD,
  }),
};

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

async function loginAs(page: Page, role: 'student' | 'parent' | 'admin') {
  const account = credentials[role]();
  test.skip(!account.email || !account.password, `Missing Playwright credentials for ${role}.`);

  await page.goto('/login');

  if (role === 'parent') {
    await page.getByRole('button', { name: /iniciar sesi[oó]n como padre/i }).click();
  } else if (role === 'admin') {
    await page.getByRole('button', { name: /acceso de administraci[oó]n/i }).click();
  }

  await page.locator('#login-email').fill(account.email!);
  await page.locator('#login-password').fill(account.password!);
  await page.getByRole('button', { name: /^iniciar sesi[oó]n$/i }).click();

  const destination = role === 'student' ? /\/menu$/ : role === 'parent' ? /\/parent\/family$/ : /\/admin(?:\/)?$/;
  await page.waitForURL(destination, { timeout: 30_000 });
}

async function assertHealthyInterface(
  page: Page,
  errors: { consoleErrors: string[]; pageErrors: string[]; failedResponses: string[] },
) {
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/application error|uncaught|chunkloaderror|algo sali[oó] mal/i);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
  expect(errors.failedResponses).toEqual([]);
}

test.describe('student interface', () => {
  test('student can authenticate and open the main interface', async ({ page }) => {
    const errors = await collectBrowserErrors(page);
    await loginAs(page, 'student');
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
    test(`student interface route ${path} loads without browser errors`, async ({ page }) => {
      const errors = await collectBrowserErrors(page);
      await loginAs(page, 'student');
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await assertHealthyInterface(page, errors);
    });
  }
});

test.describe('parent interface', () => {
  test('parent can authenticate and open the family interface', async ({ page }) => {
    const errors = await collectBrowserErrors(page);
    await loginAs(page, 'parent');
    await assertHealthyInterface(page, errors);
    await expect(page).toHaveURL(/\/parent\/family$/);
  });

  test('parent registration interface opens without browser errors', async ({ page }) => {
    const errors = await collectBrowserErrors(page);
    await page.goto('/register-parent');
    await page.waitForLoadState('networkidle');
    await assertHealthyInterface(page, errors);
    await expect(page.locator('body')).toContainText(/padre|familia|registro/i);
  });
});

test.describe('admin interface', () => {
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
    '/admin/reset',
  ];

  for (const path of adminRoutes) {
    test(`admin interface route ${path} loads without browser errors`, async ({ page }) => {
      const errors = await collectBrowserErrors(page);
      await loginAs(page, 'admin');
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await assertHealthyInterface(page, errors);
      await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}$`));
    });
  }
});
