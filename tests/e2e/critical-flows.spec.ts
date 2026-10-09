import { test, expect, type Page } from './auth-fixture';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import * as XLSX from '@redoper1/xlsx-js-style';

type Role = 'student' | 'parent' | 'staff' | 'admin';

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

async function login(page: Page, role: Role, e2eAuth: { install: (page: Page, role: Role) => Promise<void> }) {
  await e2eAuth.install(page, role);
  const destination = role === 'student' ? '/menu' : role === 'parent' ? '/parent/family' : role === 'staff' ? '/staff' : '/admin';
  await page.goto(destination);
  await page.waitForLoadState('domcontentloaded');
}

async function healthy(page: Page, state: Awaited<ReturnType<typeof monitor>>) {
  await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
  expect(state.errors, JSON.stringify(state.errors)).toEqual([]);
  expect(state.responses, JSON.stringify(state.responses)).toEqual([]);
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/application error|chunkloaderror|uncaught|algo sali[oó] mal/i);
}

test.describe('critical functional flows @student', () => {
  // These flows share the real E2E Student/Admin accounts and include one real purchase.
  // Keep this stateful suite ordered while independent UI/read-only suites use CI workers in parallel.
  test.describe.configure({ mode: 'serial' });
  test('public authentication and recovery surfaces are usable', async ({ page }) => {
    const state = await monitor(page);
    for (const path of ['/login', '/register-student', '/register-student/form', '/register-parent', '/forgot-password']) {
      await page.goto(path);
      await healthy(page, state);
      await expect(page.locator('input,button').first()).toBeVisible();
    }
  });

  test('student menu supports search, category filtering and cart lifecycle', async ({ page, e2eAuth }) => {
    const state = await monitor(page);
    await login(page, 'student', e2eAuth);
    await healthy(page, state);
    const search = page.locator('input[type="search"], input[placeholder*="Buscar" i], input[placeholder*="buscar" i]').first();
    if (await search.count()) { await search.fill('zzzz-no-match'); await expect(search).toHaveValue('zzzz-no-match'); await search.fill(''); }
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

  test('student account surfaces and logout work', async ({ page, e2eAuth }) => {
    const state = await monitor(page);
    await e2eAuth.login(page, 'student');
    for (const path of ['/student/features', '/student/account', '/student/wallet', '/student/history', '/student/favorites', '/student/link-code', '/student/notifications']) { await page.goto(path); await healthy(page, state); }
    const logout = page.getByRole('button', { name: /cerrar sesi[oó]n/i }).first();
    if (await logout.count()) { await logout.click(); await page.waitForURL(/\/(?:login)?$/); }
    await healthy(page, state);
  });

  test('parent family interface exposes student-selection workflow', async ({ page, e2eAuth }) => {
    const state = await monitor(page);
    await login(page, 'parent', e2eAuth);
    await healthy(page, state);
    const actionButtons = page.getByRole('button').filter({ hasText: /usar|seleccionar|ver|estudiante|entrar/i });
    if (await actionButtons.count()) await actionButtons.first().click();
    await healthy(page, state);
  });

  test('admin feature center has unique functional destinations', async ({ page, e2eAuth }) => {
    const state = await monitor(page);
    await login(page, 'admin', e2eAuth);
    await page.goto('/admin/features');
    await healthy(page, state);
    const center = page.getByTestId('admin-feature-center');
    await expect(center).toBeVisible({ timeout: 30_000 });
    await expect(center.getByRole('heading', { name: 'Operación diaria' })).toBeVisible({ timeout: 30_000 });
    const links = center.locator('a.feature-center-card[href^="/admin/"]');
    await expect.poll(() => links.count(), { timeout: 30_000, message: 'admin feature center cards must render' }).toBe(15);
    const hrefs = await links.evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href')).filter(Boolean) as string[]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs.length).toBe(15);
    for (const href of hrefs) { await page.goto(href); await healthy(page, state); await expect(page).toHaveURL(new RegExp(`${href.replaceAll('/', '\\/')}$`)); }
  });

  test('admin orders supports detail/filter controls when data exists', async ({ page, e2eAuth }) => {
    const state = await monitor(page);
    await login(page, 'admin', e2eAuth);
    await page.goto('/admin/orders');
    await healthy(page, state);
    const filter = page.getByRole('combobox').first();
    if (await filter.count()) { await filter.click(); const preparing = page.getByRole('option', { name: /en preparación/i }); if (await preparing.count()) await preparing.click(); }
    const detail = page.getByRole('button', { name: /ver detalles/i }).first();
    if (await detail.count()) { await detail.click(); await expect(page.getByRole('dialog')).toBeVisible(); const close = page.getByRole('button', { name: /cerrar/i }).first(); if (await close.count()) await close.click(); }
    await healthy(page, state);
  });

  test('admin system and reset pages expose operational controls without runtime errors', async ({ page, e2eAuth }) => {
    const state = await monitor(page);
    await login(page, 'admin', e2eAuth);
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

  test('student completes purchase, admin confirms payment, staff prepares and delivers, and records reconcile', async ({ browser, e2eAuth }, testInfo) => {
    const auditUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const studentEmail = process.env.PLAYWRIGHT_E2E_EMAIL;
    if (!auditUrl || !serviceRoleKey || !studentEmail) {
      throw new Error('Missing read-only database evidence configuration for integral purchase acceptance.');
    }
    // This privileged client is read-only in this test. All mutations below are made through the real UI.
    const auditDb = createClient(auditUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const studentPage = await browser.newPage();
    const studentState = await monitor(studentPage);
    await login(studentPage, 'student', e2eAuth);
    await healthy(studentPage, studentState);

    const addButtons = studentPage.getByRole('button', { name: /^agregar$/i });
    await expect(addButtons.first()).toBeVisible();
    const productCard = addButtons.first().locator('xpath=ancestor::article[1]');
    const productName = (await productCard.locator('p').first().innerText()).trim();
    const { data: productBeforeData, error: productBeforeError } = await auditDb
      .from('products')
      .select('id,name,stock,price')
      .eq('name', productName)
      .eq('available', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (productBeforeError) throw productBeforeError;
    if (!productBeforeData) throw new Error('No pude obtener el producto desde la base de datos: ' + productName);
    const productBefore = productBeforeData as { id: string; name: string; stock: number; price: number };
    const stockBefore = Number(productBefore.stock);
    expect(stockBefore, productName + ' debe tener existencias antes de comprar').toBeGreaterThan(0);
    await expect(productCard).toContainText(productName);

    await addButtons.first().click();
    await studentPage.getByRole('button', { name: /abrir carrito/i }).click();
    const cartSheet = studentPage.getByRole('heading', { name: 'Tu pedido', exact: true }).locator('xpath=../..');
    await expect(cartSheet).toBeVisible();
    await expect(cartSheet).toContainText(/método de pago/i);
    await expect(cartSheet).toContainText(productName);

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
    if (!orderNumber) throw new Error('La aplicación no devolvió número de pedido.');

    const { data: studentProfile, error: studentProfileError } = await auditDb
      .from('profiles')
      .select('id,email')
      .ilike('email', studentEmail)
      .maybeSingle();
    if (studentProfileError) throw studentProfileError;
    if (!studentProfile) throw new Error('No encontré el perfil del estudiante E2E en la base de datos.');

    const { data: createdOrderData, error: createdOrderError } = await auditDb
      .from('orders')
      .select('id,user_id,total,status,payment_status,admin_hidden,created_at,order_items(id,product_id,quantity,price)')
      .eq('order_number', orderNumber)
      .maybeSingle();
    if (createdOrderError) throw createdOrderError;
    if (!createdOrderData) throw new Error('El pedido ' + orderNumber + ' no está persistido después de la compra.');
    const createdOrder = createdOrderData as {
      id: string;
      user_id: string;
      total: number;
      status: string;
      payment_status: string;
      admin_hidden: boolean;
      created_at: string;
      order_items: Array<{ id: string; product_id: string; quantity: number; price: number }>;
    };
    expect(createdOrder.user_id).toBe(studentProfile.id);
    expect(createdOrder.status).toBe('pending');
    expect(createdOrder.payment_status).toBe('pending');
    expect(createdOrder.admin_hidden).toBe(false);
    expect(createdOrder.order_items).toHaveLength(1);
    expect(createdOrder.order_items[0].product_id).toBe(productBefore.id);
    expect(Number(createdOrder.total)).toBe(
      createdOrder.order_items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0),
    );

    const purchasedQuantity = createdOrder.order_items.reduce((sum, item) => sum + Number(item.quantity), 0);
    const { data: productAfterCheckoutData, error: productAfterCheckoutError } = await auditDb
      .from('products')
      .select('stock')
      .eq('id', productBefore.id)
      .single();
    if (productAfterCheckoutError) throw productAfterCheckoutError;
    const stockAfterCheckout = Number(productAfterCheckoutData.stock);
    expect(stockAfterCheckout).toBe(stockBefore - purchasedQuantity);

    const movementSince = new Date(Date.parse(createdOrder.created_at) - 5_000).toISOString();
    const { data: movementData, error: movementError } = await auditDb
      .from('inventory_movements')
      .select('id,product_id,movement_type,quantity,previous_stock,new_stock,created_at')
      .eq('product_id', productBefore.id)
      .gte('created_at', movementSince)
      .order('created_at', { ascending: false });
    if (movementError) throw movementError;
    const matchingMovement = (movementData ?? []).filter((movement) =>
      Number(movement.previous_stock) === stockBefore
      && Number(movement.new_stock) === stockAfterCheckout
      && Number(movement.quantity) === purchasedQuantity,
    );
    expect(
      matchingMovement.length,
      'Debe existir un movimiento que concilie stock ' + stockBefore + ' → ' + stockAfterCheckout + ' para ' + orderNumber,
    ).toBeGreaterThanOrEqual(1);

    const studentLogout = studentPage.getByRole('button', { name: /cerrar sesión/i }).first();
    await studentPage.getByRole('button', { name: /^cerrar$/i }).click().catch(() => undefined);
    await studentLogout.click();
    await studentPage.waitForURL(/\/login$/);
    await studentPage.close();

    const adminPage = await browser.newPage();
    const adminState = await monitor(adminPage);
    await login(adminPage, 'admin', e2eAuth);
    await adminPage.goto('/admin/payments');
    await healthy(adminPage, adminState);

    const paymentCard = adminPage.getByTestId('admin-payment-' + orderNumber);
    await expect(paymentCard).toBeVisible({ timeout: 15_000 });
    await paymentCard.getByRole('button', { name: /^confirmar$/i }).click();
    try {
      await expect(paymentCard.getByText('Confirmado', { exact: true })).toBeVisible({ timeout: 15_000 });
    } catch (error) {
      const [cardText, pageText] = await Promise.all([
        paymentCard.innerText().catch(() => '<payment card unavailable>'),
        adminPage.locator('body').innerText().catch(() => '<body unavailable>'),
      ]);
      console.error('PAYMENT_CONFIRMATION_DIAGNOSTICS', JSON.stringify({
        orderNumber,
        cardText,
        apiResponses: adminState.responses,
        browserErrors: adminState.errors,
        visiblePaymentFeedback: pageText.split('\n').filter((line) => /pago|confirm|error|falló|fallo|permiso|pedido/i.test(line)).slice(-30),
      }));
      throw error;
    }

    await expect.poll(async () => {
      const { data, error } = await auditDb.from('orders').select('payment_status,status').eq('id', createdOrder.id).maybeSingle();
      if (error) throw error;
      return data?.payment_status ?? null;
    }, { timeout: 15_000 }).toBe('confirmed');
    await expect.poll(async () => {
      const { data, error } = await auditDb.from('orders').select('status').eq('id', createdOrder.id).maybeSingle();
      if (error) throw error;
      return data?.status ?? null;
    }, { timeout: 15_000 }).toBe('pending');

    await adminPage.goto('/admin/orders');
    await healthy(adminPage, adminState);
    const orderCard = adminPage.getByTestId('admin-order-' + orderNumber);
    await expect(orderCard).toBeVisible({ timeout: 15_000 });
    await expect(orderCard).toContainText(/pedido recibido|confirmado/i);
    const openAdminMenu = adminPage.getByRole('button', { name: 'Abrir menú lateral', exact: true });
    if (await openAdminMenu.count() && await openAdminMenu.isVisible()) await openAdminMenu.click();
    const adminLogout = adminPage.getByRole('button', { name: /cerrar sesión/i }).first();
    await adminLogout.scrollIntoViewIfNeeded();
    await adminLogout.click();
    await adminPage.waitForURL(/\/login$/);
    await adminPage.close();

    const staffPage = await browser.newPage();
    const staffState = await monitor(staffPage);
    await login(staffPage, 'staff', e2eAuth);
    await healthy(staffPage, staffState);
    const staffOrderCard = staffPage.locator('article').filter({ hasText: orderNumber }).first();
    await expect(staffOrderCard).toBeVisible({ timeout: 20_000 });
    await staffOrderCard.getByRole('button', { name: 'Comenzar preparación', exact: true }).click();
    await expect(staffOrderCard).toContainText(/En preparación/i);
    await expect.poll(async () => {
      const { data, error } = await auditDb.from('orders').select('status').eq('id', createdOrder.id).maybeSingle();
      if (error) throw error;
      return data?.status ?? null;
    }, { timeout: 15_000 }).toBe('preparing');
    await healthy(staffPage, staffState);

    await staffOrderCard.getByRole('button', { name: 'Marcar como listo', exact: true }).click();
    await expect(staffOrderCard).toContainText(/\bListo\b/i);
    await expect.poll(async () => {
      const { data, error } = await auditDb.from('orders').select('status').eq('id', createdOrder.id).maybeSingle();
      if (error) throw error;
      return data?.status ?? null;
    }, { timeout: 15_000 }).toBe('ready');
    await healthy(staffPage, staffState);

    await staffOrderCard.getByRole('button', { name: 'Marcar como entregado', exact: true }).click();
    await expect.poll(async () => {
      const { data, error } = await auditDb.from('orders').select('status').eq('id', createdOrder.id).maybeSingle();
      if (error) throw error;
      return data?.status ?? null;
    }, { timeout: 15_000 }).toBe('delivered');
    await expect(staffOrderCard).toHaveCount(0, { timeout: 15_000 });
    await healthy(staffPage, staffState);
    await staffPage.close();

    const { data: productAfterDeliveryData, error: productAfterDeliveryError } = await auditDb
      .from('products')
      .select('stock')
      .eq('id', productBefore.id)
      .single();
    if (productAfterDeliveryError) throw productAfterDeliveryError;
    expect(Number(productAfterDeliveryData.stock)).toBe(stockAfterCheckout);

    const verificationPage = await browser.newPage();
    const verificationState = await monitor(verificationPage);
    await login(verificationPage, 'student', e2eAuth);
    await verificationPage.goto('/student/history');
    await healthy(verificationPage, verificationState);
    const historyCard = verificationPage.locator('article').filter({ hasText: orderNumber }).first();
    await expect(historyCard).toBeVisible({ timeout: 15_000 });
    await expect(historyCard).toContainText(/Recogida/i);
    const pickupLine = historyCard.locator('div.grid').filter({ hasText: /Recogida/i }).last();
    await expect(pickupLine).toContainText(/[A-Z0-9]{6,}/);
    await expect(historyCard.getByText(/entregado/i).first()).toBeVisible();
    await verificationPage.close();

    const reportPage = await browser.newPage();
    const reportState = await monitor(reportPage);
    await login(reportPage, 'admin', e2eAuth);
    await reportPage.goto('/admin/reports');
    await healthy(reportPage, reportState);
    const purchaseDate = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(createdOrder.created_at));
    await reportPage.getByLabel('Fecha de referencia del informe').fill(purchaseDate);
    await reportPage.getByRole('button', { name: 'Diario', exact: true }).click();
    const downloadPromise = reportPage.waitForEvent('download');
    await reportPage.getByRole('button', { name: /descargar excel/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);
    const downloadPath = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(downloadPath);
    const workbook = XLSX.read(readFileSync(downloadPath), { type: 'buffer' });
    expect(workbook.Sheets['Ventas']).toBeDefined();
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Ventas'], { header: 1, raw: true }) as unknown[][];
    const exportedOrder = rows.find((row) => String(row[0] ?? '') === orderNumber);
    expect(exportedOrder, 'El Excel diario debe incluir el pedido ' + orderNumber).toBeDefined();
    if (!exportedOrder) throw new Error('El Excel diario no contiene el pedido ' + orderNumber + '.');
    expect(String(exportedOrder[6])).toBe('Entregado');
    expect(String(exportedOrder[7])).toBe('Confirmado');
    expect(Number(exportedOrder[11])).toBe(Number(createdOrder.total));
    await healthy(reportPage, reportState);
    await reportPage.close();
  });

  test('theme preference remains account-specific across logout and login', async ({ browser, e2eAuth }) => {
    const studentPage = await browser.newPage();
    const studentState = await monitor(studentPage);
    await login(studentPage, 'student', e2eAuth);
    await studentPage.goto('/student/account');
    await healthy(studentPage, studentState);

    const lightTheme = studentPage.getByRole('radio', { name: /claro/i });
    await expect(lightTheme).toBeVisible();
    await lightTheme.click();
    await expect.poll(async () => studentPage.locator('html').getAttribute('data-qb-theme')).toBe('light');

    const studentMenu = await browser.newPage();
    const studentMenuState = await monitor(studentMenu);
    await login(studentMenu, 'student', e2eAuth);
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
    await login(parentPage, 'parent', e2eAuth);
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
    await login(studentAgain, 'student', e2eAuth);
    await expect.poll(async () => studentAgain.locator('html').getAttribute('data-qb-theme')).toBe('light');
    await healthy(studentAgain, studentAgainState);
    await studentAgain.close();
  });

  test('student and admin critical surfaces do not overflow on mobile and tablet widths', async ({ browser, e2eAuth }) => {
    for (const width of [390, 768, 1024]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const state = await monitor(page);
      await login(page, 'student', e2eAuth);
      await page.goto('/menu');
      await healthy(page, state);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `student /menu horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
      await page.close();
    }

    const adminPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const adminState = await monitor(adminPage);
    await login(adminPage, 'admin', e2eAuth);
    await adminPage.goto('/admin/orders');
    await healthy(adminPage, adminState);
    const adminOverflow = await adminPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(adminOverflow, 'admin /admin/orders horizontal overflow at 390px').toBeLessThanOrEqual(1);
    await adminPage.close();
  });

});
