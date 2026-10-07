import { test, expect, type Page } from '@playwright/test';

type Role = 'student' | 'parent' | 'staff' | 'admin';

const credentials = {
  student: () => ({ email: process.env.PLAYWRIGHT_E2E_EMAIL, password: process.env.PLAYWRIGHT_E2E_PASSWORD }),
  parent: () => ({ email: process.env.PLAYWRIGHT_PARENT_EMAIL, password: process.env.PLAYWRIGHT_PARENT_PASSWORD }),
  staff: () => ({ email: process.env.PLAYWRIGHT_STAFF_EMAIL, password: process.env.PLAYWRIGHT_STAFF_PASSWORD }),
  admin: () => ({ email: process.env.PLAYWRIGHT_ADMIN_EMAIL, password: process.env.PLAYWRIGHT_ADMIN_PASSWORD }),
};

const routes: Record<Role, string[]> = {
  student: ['/student/features', '/menu?tab=menu', '/menu?tab=orders', '/student/reviews', '/student/order-windows', '/student/account', '/student/wallet', '/student/history', '/student/rewards', '/student/favorites', '/student/link-code', '/student/notifications'],
  parent: ['/parent/family', '/parent/food-controls', '/parent/wellbeing'],
  staff: ['/staff', '/staff/orders'],
  admin: ['/admin', '/admin/features', '/admin/operations', '/admin/rankings', '/admin/reviews', '/admin/orders', '/admin/payments', '/admin/wallet', '/admin/inventory', '/admin/menu', '/admin/nutrition', '/admin/verification', '/admin/users', '/admin/academic', '/admin/recess', '/admin/loyalty', '/admin/reports', '/admin/history', '/admin/system', '/admin/reset'],
};

async function loginAs(page: Page, role: Role) {
  const { email, password } = credentials[role]();
  if (!email || !password) throw new Error('Missing credentials for ' + role);
  // Reset auth storage only when entering the real app origin. about:blank has an opaque origin,
  // so accessing sessionStorage there throws SecurityError in Chromium.
  await page.addInitScript(() => {
    if (window.location.pathname === '/login') {
      window.sessionStorage.clear();
      window.localStorage.removeItem('quickbite.auth.context');
    }
  });
  await page.goto('/login?preview_role=' + role);
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: /iniciar sesión|login|entrar/i }).click();
  await page.waitForLoadState('domcontentloaded');
}

async function installErrorMonitors(page: Page) {
  const errors = { console: [] as string[], page: [] as string[], api: [] as string[] };
  page.on('console', m => { if (m.type() === 'error') errors.console.push(m.text()); });
  page.on('pageerror', e => errors.page.push(e.message));
  page.on('response', response => {
    if (response.status() >= 500) errors.api.push(response.url() + ' [' + response.status() + ']');
  });
  return errors;
}

function resetMonitors(errors: { console: string[]; page: string[]; api: string[] }) {
  errors.console.length = 0;
  errors.page.length = 0;
  errors.api.length = 0;
}

async function assertMonitorsClean(errors: { console: string[]; page: string[]; api: string[] }, context: string) {
  expect(errors.page, context + ' page errors').toEqual([]);
  expect(errors.api, context + ' HTTP 5xx errors').toEqual([]);
}

test.describe('interactive UI control audit', () => {
  test.describe.configure({ mode: 'serial' });

  for (const role of ['student', 'parent', 'staff', 'admin'] as const) {
    test(role + ': visible interface and safe controls respond without runtime/API errors', async ({ page }) => {
      const errors = await installErrorMonitors(page);
      await loginAs(page, role);
      for (const route of routes[role]) {
        await page.goto(route);
        await page.waitForLoadState('domcontentloaded');
        const interactiveCount = await page.locator('button:not([disabled]):visible, a[href]:visible, select:not([disabled]):visible, input:not([disabled]):visible, textarea:not([disabled]):visible, [role=tab]:visible, [role=combobox]:visible').count();
        expect(interactiveCount, 'interactive controls must be discoverable on ' + route).toBeGreaterThan(0);
        resetMonitors(errors);
        const tabs = await page.getByRole('tab').all();
        for (const tab of tabs.slice(0, 20)) {
          if (await tab.isVisible().catch(() => false)) await tab.click().catch(() => undefined);
        }
        await assertMonitorsClean(errors, role + ' ' + route);
      }
    });
  }
});
