import { chromium, type FullConfig, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type Role = 'student' | 'parent' | 'staff' | 'admin';

const AUTH_STORAGE_KEYS: Record<Role, string> = {
  student: 'quickbite.user.auth',
  parent: 'quickbite.user.auth',
  staff: 'quickbite.user.auth',
  admin: 'quickbite.admin.auth',
};

const credentials: Record<Role, () => { email?: string; password?: string }> = {
  student: () => ({ email: process.env.PLAYWRIGHT_E2E_EMAIL, password: process.env.PLAYWRIGHT_E2E_PASSWORD }),
  parent: () => ({ email: process.env.PLAYWRIGHT_PARENT_EMAIL, password: process.env.PLAYWRIGHT_PARENT_PASSWORD }),
  staff: () => ({ email: process.env.PLAYWRIGHT_STAFF_EMAIL, password: process.env.PLAYWRIGHT_STAFF_PASSWORD }),
  admin: () => ({ email: process.env.PLAYWRIGHT_ADMIN_EMAIL, password: process.env.PLAYWRIGHT_ADMIN_PASSWORD }),
};

const destination: Record<Role, RegExp> = {
  student: /\/menu$/,
  parent: /\/parent\/family$/,
  staff: /\/staff(?:\/orders)?$/,
  admin: /\/admin(?:\/)?$/,
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

async function captureRoleSession(page: Page, role: Role) {
  const account = credentials[role]();
  if (!account.email || !account.password) throw new Error(`Missing Playwright credentials for ${role}.`);

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
  if (!value) throw new Error(`Supabase auth sessionStorage key "${key}" was not captured for ${role}.`);
  return value;
}

export default async function globalAuthSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://127.0.0.1:4173';
  const browser = await chromium.launch();
  const sessions: Record<Role, string> = {} as Record<Role, string>;

  try {
    for (const role of ['student', 'parent', 'staff', 'admin'] as const) {
      const context = await browser.newContext({ baseURL });
      try {
        const page = await context.newPage();
        sessions[role] = await captureRoleSession(page, role);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const outputDir = join(process.cwd(), 'test-results');
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'e2e-auth-sessions.json'), JSON.stringify(sessions), 'utf8');
}
