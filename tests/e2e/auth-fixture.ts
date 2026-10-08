import { test as base, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

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
  e2eAuth: [async ({}, use) => {
    const workerSessions = new Map<E2ERole, Promise<string>>();

    const getWorkerSession = (role: E2ERole) => {
      const cached = workerSessions.get(role);
      if (cached) return cached;

      const sessionPromise = (async () => {
        const url = process.env.VITE_SUPABASE_URL;
        const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
        const credentials = {
          student: [process.env.PLAYWRIGHT_E2E_EMAIL, process.env.PLAYWRIGHT_E2E_PASSWORD],
          parent: [process.env.PLAYWRIGHT_PARENT_EMAIL, process.env.PLAYWRIGHT_PARENT_PASSWORD],
          staff: [process.env.PLAYWRIGHT_STAFF_EMAIL, process.env.PLAYWRIGHT_STAFF_PASSWORD],
          admin: [process.env.PLAYWRIGHT_ADMIN_EMAIL, process.env.PLAYWRIGHT_ADMIN_PASSWORD],
        }[role];

        if (!url || !anonKey) throw new Error('Missing Supabase E2E configuration.');
        const [email, password] = credentials;
        if (!email || !password) throw new Error(`Missing Playwright credentials for ${role}.`);

        const client = createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error || !data.session) {
          throw new Error(`Could not create the worker E2E session for ${role}: ${error?.message ?? 'missing session'}`);
        }
        return JSON.stringify(data.session);
      })();

      workerSessions.set(role, sessionPromise);
      return sessionPromise;
    };

    await use({
      install: async (page, role) => {
        const storageValue = await getWorkerSession(role);
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
