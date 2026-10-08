import { test as base, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export * from '@playwright/test';

export type E2ERole = 'student' | 'parent' | 'staff' | 'admin';

const AUTH_STORAGE_KEYS: Record<E2ERole, string> = {
  student: 'quickbite.user.auth',
  parent: 'quickbite.user.auth',
  staff: 'quickbite.user.auth',
  admin: 'quickbite.admin.auth',
};

const DESTINATIONS: Record<E2ERole, string> = {
  student: '/menu',
  parent: '/parent/family',
  staff: '/staff',
  admin: '/admin',
};

type E2EAuth = {
  install: (page: Page, role: E2ERole) => Promise<void>;
  login: (page: Page, role: E2ERole) => Promise<void>;
};

type WorkerFixtures = {
  e2eAuth: E2EAuth;
};

async function openInternalAccess(page: Page, role: 'staff' | 'admin') {
  await page.goto('/login');
  const logo = page.getByRole('button', { name: 'QuickBite', exact: true });
  await logo.waitFor({ state: 'visible', timeout: 15_000 });
  const box = await logo.boundingBox();
  if (!box) throw new Error('QuickBite login logo has no bounding box.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(2_600);
  await page.mouse.up();

  const dialog = page.getByRole('dialog', { name: 'Acceso interno' });
  await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  await dialog.getByRole('button', {
    name: role === 'staff' ? /personal de cafeter[ií]a/i : /administraci[oó]n/i,
  }).click();
}

async function loginWithCredentials(page: Page, role: E2ERole) {
  const credentials = {
    student: [process.env.PLAYWRIGHT_E2E_EMAIL, process.env.PLAYWRIGHT_E2E_PASSWORD],
    parent: [process.env.PLAYWRIGHT_PARENT_EMAIL, process.env.PLAYWRIGHT_PARENT_PASSWORD],
    staff: [process.env.PLAYWRIGHT_STAFF_EMAIL, process.env.PLAYWRIGHT_STAFF_PASSWORD],
    admin: [process.env.PLAYWRIGHT_ADMIN_EMAIL, process.env.PLAYWRIGHT_ADMIN_PASSWORD],
  }[role];

  const [email, password] = credentials;
  if (!email || !password) throw new Error(`Missing Playwright credentials for ${role}.`);

  await page.goto('/login');
  if (role === 'parent') {
    await page.getByRole('button', { name: /iniciar sesi[oó]n como padre/i }).click();
  } else if (role === 'staff' || role === 'admin') {
    await openInternalAccess(page, role);
  }

  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: /^iniciar sesi[oó]n$/i }).click();
  await page.waitForURL(new RegExp(`${DESTINATIONS[role].replaceAll('/', '\\/')}$`), { timeout: 45_000 });
  await page.waitForLoadState('domcontentloaded');
}

export const test = base.extend<Record<string, never>, WorkerFixtures>({
  e2eAuth: [async ({ browserName }, use) => {
    void browserName;
    const raw = await readFile(join(process.cwd(), 'test-results', 'e2e-auth-sessions.json'), 'utf8');
    const sessions = JSON.parse(raw) as Record<E2ERole, string>;

    await use({
      install: async (page, role) => {
        const storageValue = sessions[role];
        if (!storageValue) throw new Error(`Missing captured auth session for ${role}.`);
        const key = AUTH_STORAGE_KEYS[role];

        await page.context().addInitScript(({ storageKey, storageValue: value }) => {
          window.sessionStorage.removeItem('quickbite.user.auth');
          window.sessionStorage.removeItem('quickbite.admin.auth');
          window.sessionStorage.setItem(storageKey, value);
        }, { storageKey: key, storageValue });
      },
      login: loginWithCredentials,
    });
  }, { scope: 'worker' }],
});
