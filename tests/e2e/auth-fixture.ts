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

type E2EAuth = {
  install: (page: Page, role: E2ERole) => Promise<void>;
};

type WorkerFixtures = {
  e2eAuth: E2EAuth;
};

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
    });
  }, { scope: 'worker' }],
});
