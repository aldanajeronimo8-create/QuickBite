import { test, expect, type Page } from '@playwright/test';

type Role = 'student' | 'parent' | 'admin';

const credentials: Record<Role, () => { email?: string; password?: string }> = {
  student: () => ({ email: process.env.PLAYWRIGHT_E2E_EMAIL, password: process.env.PLAYWRIGHT_E2E_PASSWORD }),
  parent: () => ({ email: process.env.PLAYWRIGHT_PARENT_EMAIL, password: process.env.PLAYWRIGHT_PARENT_PASSWORD }),
  admin: () => ({ email: process.env.PLAYWRIGHT_ADMIN_EMAIL, password: process.env.PLAYWRIGHT_ADMIN_PASSWORD }),
};

async function monitor(page: Page) {
  const errors: string[] = [];
  const responses: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', async (r) => {
    if (r.status() < 400) return;
    const url = r.url();
    if (!/\/rest\/|\/auth\/|\/functions\//.test(url)) return;
    let body = '';
    try { body = (await r.text()).slice(0, 300); } catch { body = '<unreadable>'; }
    responses.push(`${r.status()} ${r.request().method()} ${url} ${body}`);
  });
  return { errors, responses };
}

async function login(page: Page, role: Role) {
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

async function healthy(page: Page, state: Awaited<ReturnType<typeof monitor>>) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(700);
  expect(state.errors, JSON.stringify(state.errors)).toEqual([]);
  expect(state.responses, JSON.stringify(state.responses)).toEqual([]);
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/application error|chunkloaderror|uncaught|algo sali[oó] mal/i);
}

test.describe('critical functional flows', () => {
  test('public authentication and recovery surfaces are usable', async ({ page }) => {
    const state = await monitor(page);
    for (const path of ['/login', '/register-student', '/register-student/form', '/register-parent', '/forgot-password']) {
      await page.goto(path);
      await healthy(page, state);
      await expect(page.locator('input,button').first()).toBeVisible();
    }
  });

  test('student menu supports search, category filtering and cart lifecycle', async ({ page }) => {
    const state = await monitor(page);
    await login(page, 'student');
    await healthy(page, state);
    const search = page.locator('input[type="search"], input[placeholder*="Buscar" i], input[placeholder*="buscar" i]').first();
    if (await search.count()) { await search.fill('zzzz-no-match'); await page.waitForTimeout(250); await search.fill(''); }
    const categoryControls = page.getByRole('button').filter({ hasText: /^(Todas|Todo|Menú|Bebidas|Comidas|Snacks)$/i });
    if (await categoryControls.count()) await categoryControls.first().click();
    const addButtons = page.getByRole('button', { name: /agregar|añadir|sumar al carrito|comprar/i });
    if (await addButtons.count()) {
      await addButtons.first().click();
      const cartButton = page.getByRole('button', { name: /abrir carrito/i });
      await expect(cartButton).toBeVisible();
      await cartButton.click();
      const cartSheet = page.locator('div.fixed.inset-0.z-40').filter({ hasText: /tu pedido/i }).last();
      await expect(cartSheet).toBeVisible();
      await expect(cartSheet).toContainText(/tu pedido/i);
      await expect(cartSheet).toContainText(/método de pago/i);
      const minus = cartSheet.getByRole('button', { name: /disminuir|restar/i }).first();
      if (await minus.count()) await minus.click();
    }
    await healthy(page, state);
  });

  test('student account surfaces and logout work', async ({ page }) => {
    const state = await monitor(page);
    await login(page, 'student');
    for (const path of ['/student/features', '/student/account', '/student/wallet', '/student/history', '/student/favorites', '/student/link-code', '/student/notifications']) { await page.goto(path); await healthy(page, state); }
    const logout = page.getByRole('button', { name: /cerrar sesi[oó]n/i }).first();
    if (await logout.count()) { await logout.click(); await page.waitForURL(/\/(?:login)?$/); }
    await healthy(page, state);
  });

  test('parent family interface exposes student-selection workflow', async ({ page }) => {
    const state = await monitor(page);
    await login(page, 'parent');
    await healthy(page, state);
    const actionButtons = page.getByRole('button').filter({ hasText: /usar|seleccionar|ver|estudiante|entrar/i });
    if (await actionButtons.count()) await actionButtons.first().click();
    await page.waitForTimeout(300);
    await healthy(page, state);
  });

  test('admin feature center has unique functional destinations', async ({ page }) => {
    const state = await monitor(page);
    await login(page, 'admin');
    await page.goto('/admin/features');
    await healthy(page, state);
    const center = page.getByTestId('admin-feature-center');
    const links = center.locator('a[href^="/admin/"]');
    const hrefs = await links.evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href')).filter(Boolean) as string[]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs.length).toBe(15);
    for (const href of hrefs) { await page.goto(href); await healthy(page, state); await expect(page).toHaveURL(new RegExp(`${href.replaceAll('/', '\\/')}$`)); }
  });

  test('admin orders supports detail/filter controls when data exists', async ({ page }) => {
    const state = await monitor(page);
    await login(page, 'admin');
    await page.goto('/admin/orders');
    await healthy(page, state);
    const filter = page.getByRole('combobox').first();
    if (await filter.count()) { await filter.click(); const preparing = page.getByRole('option', { name: /en preparación/i }); if (await preparing.count()) await preparing.click(); }
    const detail = page.getByRole('button', { name: /ver detalles/i }).first();
    if (await detail.count()) { await detail.click(); await expect(page.getByRole('dialog')).toBeVisible(); const close = page.getByRole('button', { name: /cerrar/i }).first(); if (await close.count()) await close.click(); }
    await healthy(page, state);
  });

  test('admin system and reset pages expose operational controls without runtime errors', async ({ page }) => {
    const state = await monitor(page);
    await login(page, 'admin');
    for (const path of ['/admin/system', '/admin/reset', '/admin/payments', '/admin/wallet', '/admin/inventory', '/admin/menu', '/admin/verification', '/admin/users', '/admin/loyalty', '/admin/reports', '/admin/history']) { await page.goto(path); await healthy(page, state); }
  });

  test('unauthenticated users cannot enter protected student, parent and admin surfaces', async ({ page }) => {
    const state = await monitor(page);
    for (const path of ['/menu', '/student/wallet', '/student/history', '/student/features', '/parent/family', '/admin', '/admin/features', '/admin/users']) {
      await page.goto(path);
      await expect(page).not.toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}$`));
    }
    await healthy(page, state);
  });
});
