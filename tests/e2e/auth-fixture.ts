import { test as base, expect, type Page } from '@playwright/test';

export * from '@playwright/test';

export type E2ERole = 'student' | 'parent' | 'staff' | 'admin';

const AUTH_STORAGE_KEYS: Record<E2ERole, string> = {
  student: 'quickbite.user.auth',
  parent: 'quickbite.user.auth',
  staff: 'quickbite.user.auth',
  admin: 'quickbite.admin.auth',
};

const credentials: Record<E2ERole, () => { email?: string; password?: string }> = {
  student: () => ({ email: process.env.PLAYWRIGHT_E2E_EMAIL, password: process.env.PLAYWRIGHT_E2E_PASSWORD }),
  parent: () => ({ email: process.env.PLAYWRIGHT_PARENT_EMAIL, password: process.env.PLAYWRIGHT_PARENT_PASSWORD }),
  staff: () => ({ email: process.env.PLAYWRIGHT_STAFF_EMAIL, password: process.env.PLAYWRIGHT_STAFF_PASSWORD }),
  admin: () => ({ email: process.env.PLAYWRIGHT_ADMIN_EMAIL, password: process.env.PLAYWRIGHT_ADMIN_PASSWORD }),
};

const destination: Record<E2ERole, RegExp> = {
  student: /\/menu$/,
  parent: /\/parent\/family$/,
  staff: /\/staff(?:\/orders)?$/,
  admin: /\/admin(?:\/)?$/,
};

async function openInternalAccess(page: Page, role: 'staff' | 'admin') {
  await page.goto('/login');
  const logo = page.getByRole('button', { name: 'QuickBite', exact: true });
  await expect(logo).toBeVisible({ timeout: 15_000 });
  const box = await logo.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(2_600);
  await page.mouse.up();
  const dialog = page.getByRole('dialog', { name: 'Acceso interno' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {
    name: role === 'staff' ? /personal de cafeter[ií]a/i : /administraci[oó]n/i,
  }).click();
}

async function captureRoleSession(page: Page, role: E2ERole): Promise<string> {
  const account = credentials[role]();
  if (!account.email || !account.password) {
    throw new Error(`Missing Playwright credentials for ${role}.`);
  }

  await page.goto('/login');
  if (role === 'parent') {
    await page.getByRole('button', { name: /iniciar sesi[oó]n como padre/i }).click();
  } else if (role === 'staff' || role === 'admin') {
    await openInternalAccess(page, role);
  }

  await page.locator('#login-email').fill(account.email);
  await page.locator('#login-password').fill(account.password);
  await page.getByRole('button', { name: /^iniciar sesi[oó]n$/i }).click();
  await page.waitForURL(destination[role], { timeout: 45_000 });

  const key = AUTH_STORAGE_KEYS[role];
  const value = await page.evaluate((storageKey) => window.sessionStorage.getItem(storageKey), key);
  if (!value) {
    throw new Error(`Supabase auth sessionStorage key "${key}" was not captured for ${role}.`);
  }
  return value;
}

type E2EAuth = {
  install: (page: Page, role: E2ERole) => Promise<void>;
};

type WorkerFixtures = {
  e2eAuth: E2EAuth;
};

export const test = base.extend<{}, WorkerFixtures>({
  e2eAuth: [async ({ browser }, use) => {
    const sessions = new Map<E2ERole, string>();
    const getSession = async (role: E2ERole) => {
      const cached = sessions.get(role);
      if (cached) return cached;

      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        const session = await captureRoleSession(page, role);
        sessions.set(role, session);
        await page.close();
        return session;
      } finally {
        await context.close();
      }
    };

    await use({
      install: async (page, role) => {
        const session = await getSession(role);
        const key = AUTH_STORAGE_KEYS[role];

        await page.context().addInitScript(({ storageKey, storageValue }) => {
          window.sessionStorage.removeItem('quickbite.user.auth');
          window.sessionStorage.removeItem('quickbite.admin.auth');
          window.sessionStorage.setItem(storageKey, storageValue);
        }, { storageKey: key, storageValue: session });
      },
    });
  }, { scope: 'worker' }],
});
