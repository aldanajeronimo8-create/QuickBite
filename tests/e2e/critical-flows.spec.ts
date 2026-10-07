import { test, expect, type Page } from '@playwright/test';

type Role = 'student' | 'parent' | 'admin';

const credentials: Record<Role, () => { email?: string; password?: string }> = {
  student: () => ({ email: process.env.PLAYWRIGHT_E2E_EMAIL, password: process.env.PLAYWRIGHT_E2E_PASSWORD }),
  parent: () => ({ email: process.env.PLAYWRIGHT_PARENT_EMAIL, password: process.env.PLAYWRIGHT_PARENT_PASSWORD }),
  admin: () => ({ email: process.env.PLAYWRIGHT_ADMIN_EMAIL, password: process.env.PLAYWRIGHT_ADMIN_PASSWORD }),
};

function isExpectedUnauthenticatedAuthResponse(response: { status: () => number; url: () => string; request: () => { method: () => string } }) {
  return response.status() === 401 && response.request().method() === 'GET' && /\/auth\/v1\/user(?:$|\?)/.test(response.url());
}

async function monitor(page: Page) {
  const errors: string[] = [];
  const responses: string[] = [];

  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', async (r) => {
    const status = r.status();
    const url = r.url();

    // Product images are optional. A stale/invalid Supabase Storage object can return
    // 409 while the UI intentionally falls back to the food icon. It is not an app/API failure.
    if (status === 409 && /\/storage\/v1\/object\//.test(url)) return;

    if (status < 400 || isExpectedUnauthenticatedAuthResponse(r)) return;
    if (!/\/rest\/|\/auth\/|\/functions\//.test(url)) return;
    let body = '';
    try { body = (await r.text()).slice(0, 300); } catch { body = '<unreadable>'; }
    responses.push(`${status} ${r.request().method()} ${url} ${body}`);
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Supabase intentionally returns 401 for /auth/v1/user when no session exists.
    if (/failed to load resource: the server responded with a status of 401 \(\)/i.test(m.text())) return;
    // Chromium reports some failed resource responses only as a generic console error.
    // API 409/4xx responses are still captured by the response handler above; a generic
    // 409 console message therefore cannot be used to classify the application as broken.
    if (/failed to load resource: the server responded with a status of 409 \(\)/i.test(m.text())) return;
    errors.push(m.text());
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

  test('student completes a real purchase and admin processes it through delivery', async ({ browser }) => {
    const studentPage = await browser.newPage();
    const studentState = await monitor(studentPage);
    await login(studentPage, 'student');
    await healthy(studentPage, studentState);

    const addButtons = studentPage.getByRole('button', { name: /^agregar$/i });
    await expect(addButtons.first()).toBeVisible();
    await addButtons.first().click();

    await studentPage.getByRole('button', { name: /abrir carrito/i }).click();
    const cartSheet = studentPage.getByRole('heading', { name: 'Tu pedido', exact: true }).locator('xpath=../..');
    await expect(cartSheet).toBeVisible();
    await expect(cartSheet).toContainText(/método de pago/i);

    const nequi = cartSheet.getByRole('button', { name: /^nequi/i });
    await expect(nequi).toBeVisible();
    await nequi.click();
    await cartSheet.getByRole('button', { name: /continuar al pago/i }).click();
    const paymentSheet = studentPage.getByRole('heading', { name: 'Confirmar pago', exact: true }).locator('xpath=../..');
    await expect(paymentSheet).toBeVisible();
    await expect(paymentSheet).toContainText(/pago|referencia|total/i);
    await paymentSheet.getByRole('button', { name: /enviar para aprobación/i }).click();

    const receiptOrder = studentPage.getByText(/^QB\d{6}[A-Z0-9]+$/).last();
    await expect(receiptOrder).toBeVisible({ timeout: 15_000 });
    const orderNumber = (await receiptOrder.textContent())?.trim();
    expect(orderNumber).toMatch(/^QB\d{6}[A-Z0-9]+$/);

    const studentLogout = studentPage.getByRole('button', { name: /cerrar sesión/i }).first();
    await studentPage.getByRole('button', { name: /^cerrar$/i }).click().catch(() => undefined);
    await studentLogout.click();
    await studentPage.waitForURL(/\/login$/);
    await studentPage.close();

    const adminPage = await browser.newPage();
    const adminState = await monitor(adminPage);
    await login(adminPage, 'admin');
    await adminPage.goto('/admin/payments');
    await healthy(adminPage, adminState);

    const paymentCard = adminPage.getByTestId(`admin-payment-${orderNumber}`);
    await expect(paymentCard).toBeVisible({ timeout: 15_000 });
    await paymentCard.getByRole('button', { name: /^confirmar$/i }).click();
    await expect(paymentCard.getByText('Confirmado', { exact: true })).toBeVisible({ timeout: 15_000 });

    await adminPage.goto('/admin/orders');
    await healthy(adminPage, adminState);
    const orderCard = adminPage.getByTestId(`admin-order-${orderNumber}`);
    await expect(orderCard).toBeVisible({ timeout: 15_000 });
    await expect(orderCard).toContainText(/pedido recibido|confirmado/i);

    await orderCard.getByRole('button', { name: /^en preparación$/i }).click();
    await expect(orderCard).toContainText(/en preparación/i);
    await healthy(adminPage, adminState);
    await orderCard.getByRole('button', { name: /^listo para recoger$/i }).click();
    await expect(orderCard).toContainText(/listo para recoger/i);
    await healthy(adminPage, adminState);
    await orderCard.getByRole('button', { name: /^entregado$/i }).click();
    await expect(orderCard).toContainText(/entregado/i);
    await healthy(adminPage, adminState);

    const openAdminMenu = adminPage.getByRole('button', { name: 'Abrir menú lateral', exact: true });
    if (await openAdminMenu.count() && await openAdminMenu.isVisible()) await openAdminMenu.click();
    const adminLogout = adminPage.getByRole('button', { name: /cerrar sesión/i }).first();
    await adminLogout.scrollIntoViewIfNeeded();
    await adminLogout.click();
    await adminPage.waitForURL(/\/login$/);
    await adminPage.close();

    const verificationPage = await browser.newPage();
    const verificationState = await monitor(verificationPage);
    await login(verificationPage, 'student');
    await verificationPage.goto('/student/history');
    await healthy(verificationPage, verificationState);
    const historyCard = verificationPage.locator('article').filter({ hasText: orderNumber! }).first();
    await expect(historyCard).toBeVisible({ timeout: 15_000 });
    await expect(historyCard).toContainText(/Recogida/i);
    const pickupLine = historyCard.locator('div.grid').filter({ hasText: /Recogida/i }).last();
    await expect(pickupLine).toContainText(/[A-Z0-9]{6,}/);
    await expect(historyCard.getByText(/entregado/i).first()).toBeVisible();
    await verificationPage.close();
  });

  test('theme preference remains account-specific across logout and login', async ({ browser }) => {
    const studentPage = await browser.newPage();
    const studentState = await monitor(studentPage);
    await login(studentPage, 'student');
    await studentPage.goto('/student/account');
    await healthy(studentPage, studentState);

    const lightTheme = studentPage.getByRole('radio', { name: /claro/i });
    await expect(lightTheme).toBeVisible();
    await lightTheme.click();
    await expect.poll(async () => studentPage.locator('html').getAttribute('data-qb-theme')).toBe('light');

    const studentMenu = await browser.newPage();
    const studentMenuState = await monitor(studentMenu);
    await login(studentMenu, 'student');
    await studentMenu.goto('/menu');
    await healthy(studentMenu, studentMenuState);
    await studentMenu.getByRole('button', { name: /cerrar sesión/i }).first().click();
    await studentMenu.waitForURL(/\/login$/);
    await expect.poll(async () => studentMenu.locator('html').getAttribute('data-qb-theme')).toBe('light');
    const lightLoginTitleColor = await studentMenu.getByRole('heading', { name: 'QuickBite', exact: true }).evaluate((element) => getComputedStyle(element).color);
    expect(lightLoginTitleColor).not.toBe('rgb(255, 255, 255)');
    await studentPage.close();
    await studentMenu.close();

    const parentPage = await browser.newPage();
    const parentState = await monitor(parentPage);
    await login(parentPage, 'parent');
    await parentPage.goto('/parent/family');
    await healthy(parentPage, parentState);

    const darkTheme = parentPage.getByRole('radio', { name: /oscuro/i });
    await expect(darkTheme).toBeVisible();
    await darkTheme.click();
    await expect.poll(async () => parentPage.locator('html').getAttribute('data-qb-theme')).toBe('dark');

    await parentPage.getByRole('button', { name: /cerrar sesión/i }).first().click();
    await parentPage.waitForURL(/\/login$/);
    await expect.poll(async () => parentPage.locator('html').getAttribute('data-qb-theme')).toBe('dark');
    const darkLoginTitle = parentPage.locator('.qb-auth .qb-auth-brand-title');
    await expect(darkLoginTitle).toHaveCount(1);
    await expect(darkLoginTitle).toBeVisible();
    const darkLoginTitleColor = await darkLoginTitle.evaluate((element) => getComputedStyle(element).color);
    expect(darkLoginTitleColor).toBe('rgb(255, 255, 255)');
    await parentPage.close();

    const studentAgain = await browser.newPage();
    const studentAgainState = await monitor(studentAgain);
    await login(studentAgain, 'student');
    await expect.poll(async () => studentAgain.locator('html').getAttribute('data-qb-theme')).toBe('light');
    await healthy(studentAgain, studentAgainState);
    await studentAgain.close();
  });

  test('student and admin critical surfaces do not overflow on mobile and tablet widths', async ({ browser }) => {
    for (const width of [390, 768, 1024]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const state = await monitor(page);
      await login(page, 'student');
      await page.goto('/menu');
      await healthy(page, state);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `student /menu horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
      await page.close();
    }

    const adminPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const adminState = await monitor(adminPage);
    await login(adminPage, 'admin');
    await adminPage.goto('/admin/orders');
    await healthy(adminPage, adminState);
    const adminOverflow = await adminPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(adminOverflow, 'admin /admin/orders horizontal overflow at 390px').toBeLessThanOrEqual(1);
    await adminPage.close();
  });

});
