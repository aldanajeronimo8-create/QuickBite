import { test, expect, type Page } from '@playwright/test';

type Role = 'student' | 'parent' | 'admin';

const credentials: Record<Role, () => { email?: string; password?: string }> = {
  student: () => ({ email: process.env.PLAYWRIGHT_E2E_EMAIL, password: process.env.PLAYWRIGHT_E2E_PASSWORD }),
  parent: () => ({ email: process.env.PLAYWRIGHT_PARENT_EMAIL, password: process.env.PLAYWRIGHT_PARENT_PASSWORD }),
  admin: () => ({ email: process.env.PLAYWRIGHT_ADMIN_EMAIL, password: process.env.PLAYWRIGHT_ADMIN_PASSWORD }),
};

const routes: Record<Role, string[]> = {
  student: [
    '/menu',
    '/student/features',
    '/student/account',
    '/student/wallet',
    '/student/history',
    '/student/favorites',
    '/student/link-code',
    '/student/notifications',
    '/student/rewards',
  ],
  parent: ['/parent/family'],
  admin: [
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
  ],
};

const interactiveControlNamesToSkip = [
  /delete|eliminar|borrar/i,
  /reset|reiniciar|restaurar/i,
  /revoke|revocar/i,
  /logout|cerrar sesi[oó]n/i,
  /confirmar.*(pago|pedido|compra)/i,
  /aprobar.*(pago|recarga|pedido)/i,
  /rechazar.*(pago|recarga|pedido)/i,
  /cancelar.*(pedido|compra)/i,
  /desactivar.*usuario/i,
  /guardar|save/i,
  /crear.*(usuario|producto|pedido)/i,
  /actualizar.*(usuario|producto|pedido|estado)/i,
];

async function loginAs(page: Page, role: Role) {
  const account = credentials[role]();
  test.skip(!account.email || !account.password, `Missing Playwright credentials for ${role}.`);

  await page.goto('/login');
  if (role === 'parent') await page.getByRole('button', { name: /iniciar sesi[oó]n como padre/i }).click();
  if (role === 'admin') await page.getByRole('button', { name: /acceso de administraci[oó]n/i }).click();
  await page.locator('#login-email').fill(account.email!);
  await page.locator('#login-password').fill(account.password!);
  await page.getByRole('button', { name: /^iniciar sesi[oó]n$/i }).click();
  await page.waitForURL(role === 'student' ? /\/menu$/ : role === 'parent' ? /\/parent\/family$/ : /\/admin(?:\/)?$/);
}

async function assertNoRuntimeErrors(page: Page, label: string) {
  await page.waitForTimeout(300);
  await expect(page.locator('body'), label).toBeVisible();
  await expect(page.locator('body'), `${label}: application error text`).not.toContainText(
    /application error|chunkloaderror|uncaught|algo sali[oó] mal/i,
  );
}

function shouldSkipControl(name: string) {
  return interactiveControlNamesToSkip.some((pattern) => pattern.test(name));
}

async function dismissTransientUi(page: Page) {
  const closeButtons = page.getByRole('button', { name: /^(cerrar|close|cancelar)$/i });
  if (await closeButtons.count()) {
    for (let i = 0; i < Math.min(await closeButtons.count(), 3); i += 1) {
      const button = closeButtons.nth(i);
      if (await button.isVisible().catch(() => false)) {
        await button.click().catch(() => undefined);
        break;
      }
    }
  }
}

async function installErrorMonitors(page: Page) {
  const errors: string[] = [];
  const badResponses: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', async (response) => {
    if (response.status() < 400) return;
    const url = response.url();
    if (!/\/rest\/|\/auth\/|\/functions\//.test(url)) return;
    let body = '';
    try {
      body = (await response.text()).slice(0, 250);
    } catch {
      body = '<unreadable>'; 
    }
    badResponses.push(`${response.status()} ${response.request().method()} ${url} ${body}`);
  });
  return { errors, badResponses };
}

async function assertMonitorsClean(
  monitors: { errors: string[]; badResponses: string[] },
  context: string,
) {
  expect(monitors.errors, `${context}: browser errors`).toEqual([]);
  expect(monitors.badResponses, `${context}: API errors`).toEqual([]);
}

test.describe('interactive UI control audit', () => {
  test.describe.configure({ mode: 'serial' });

  for (const role of ['student', 'parent', 'admin'] as const) {
    test(`${role}: every visible safe button responds without runtime/API errors`, async ({ page }) => {
      const monitors = await installErrorMonitors(page);
      await loginAs(page, role);

      for (const route of routes[role]) {
        await page.goto(route);
        await page.waitForLoadState('domcontentloaded');
        await assertNoRuntimeErrors(page, `${role} ${route}`);

        const controls = await page.getByRole('button').evaluateAll((buttons) =>
          buttons
            .map((button, index) => ({
              index,
              name: (button.textContent || button.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(),
              disabled: (button as HTMLButtonElement).disabled,
              visible: Boolean(button.getBoundingClientRect().width && button.getBoundingClientRect().height),
            }))
            .filter((control) => control.visible && !control.disabled && control.name),
        );

        for (const control of controls) {
          if (shouldSkipControl(control.name)) continue;

          await page.goto(route);
          await page.waitForLoadState('domcontentloaded');

          const candidates = page.getByRole('button', { name: control.name, exact: true });
          const candidateCount = await candidates.count();
          if (!candidateCount) continue;

          const button = candidates.nth(Math.min(control.index, candidateCount - 1));
          if (!(await button.isVisible().catch(() => false)) || (await button.isDisabled().catch(() => true))) continue;

          const beforeUrl = page.url();
          await button.click({ timeout: 8_000 });
          await page.waitForTimeout(250);

          await assertNoRuntimeErrors(page, `${role} ${route} button "${control.name}"`);
          await dismissTransientUi(page);

          if (page.url() !== beforeUrl && page.url().startsWith('http')) {
            await page.goto(route);
            await page.waitForLoadState('domcontentloaded');
          }
        }
      }

      await assertMonitorsClean(monitors, `${role} control audit`);
    });

    test(`${role}: visible links, selects, tabs and search controls are interactive`, async ({ page }) => {
      const monitors = await installErrorMonitors(page);
      await loginAs(page, role);

      for (const route of routes[role]) {
        await page.goto(route);
        await page.waitForLoadState('domcontentloaded');
        await assertNoRuntimeErrors(page, `${role} ${route}`);

        const links = page.locator('a[href]:visible').filter({ hasNotText: /https?:\/\//i });
        const linkCount = Math.min(await links.count(), 20);
        for (let index = 0; index < linkCount; index += 1) {
          const link = links.nth(index);
          if (!(await link.isEnabled().catch(() => false))) continue;
          const href = await link.getAttribute('href');
          if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
          const beforeUrl = page.url();
          await link.click().catch(() => undefined);
          await page.waitForTimeout(200);
          await assertNoRuntimeErrors(page, `${role} ${route} link ${href}`);
          if (page.url() !== beforeUrl && href.startsWith('/')) {
            await page.goto(route);
            await page.waitForLoadState('domcontentloaded');
          }
        }

        const searchInputs = page.locator('input[type="search"], input[placeholder*="buscar" i], input[placeholder*="search" i]:visible');
        for (let index = 0; index < Math.min(await searchInputs.count(), 3); index += 1) {
          const input = searchInputs.nth(index);
          if (!(await input.isVisible().catch(() => false)) || (await input.isDisabled().catch(() => true))) continue;
          await input.fill('e2e-control-audit');
          await page.waitForTimeout(150);
          await input.fill('');
        }

        const combos = page.getByRole('combobox');
        for (let index = 0; index < Math.min(await combos.count(), 5); index += 1) {
          const combo = combos.nth(index);
          if (!(await combo.isVisible().catch(() => false)) || (await combo.isDisabled().catch(() => true))) continue;
          await combo.click().catch(() => undefined);
          await page.keyboard.press('Escape').catch(() => undefined);
        }

        const tabs = page.getByRole('tab');
        for (let index = 0; index < Math.min(await tabs.count(), 10); index += 1) {
          const tab = tabs.nth(index);
          if (!(await tab.isVisible().catch(() => false)) || (await tab.isDisabled().catch(() => true))) continue;
          await tab.click();
          await page.waitForTimeout(100);
        }
      }

      await assertMonitorsClean(monitors, `${role} secondary control audit`);
    });
  }
});
