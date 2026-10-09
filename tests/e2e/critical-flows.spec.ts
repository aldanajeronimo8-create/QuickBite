import { test, expect, type Page } from './auth-fixture';
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


type AuditOrderItem = {
  product_id: string;
  quantity: number;
  price: number | string;
  stock_before: number | null;
  stock_after: number | null;
};

type AuditOrderSnapshot = {
  id: string;
  order_number: string;
  user_id: string;
  total: number | string;
  status: string;
  payment_status: string;
  created_at: string;
  order_items: AuditOrderItem[];
};

type AuditProfile = { id: string; email?: string; role: string };
type AuditInventoryMovement = {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  created_at: string;
  reason: string | null;
};
type AuditStaffEvent = {
  action: string;
  actor_id: string | null;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
};
type AuditProduct = { id: string; name: string; stock: number };
type DailyOrderAudit = {
  order_number: string;
  total: number | string;
  payment_status: string;
  created_at: string;
  order_items: Array<{ quantity: number }>;
};

async function readServiceRows<T>(table: string, query: Record<string, string>): Promise<T[]> {
  const baseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceRoleKey) {
    throw new Error('Missing service-role read configuration for transactional E2E assertions.');
  }

  const endpoint = new URL('/rest/v1/' + table, baseUrl);
  for (const [key, value] of Object.entries(query)) endpoint.searchParams.set(key, value);
  const response = await fetch(endpoint, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: 'Bearer ' + serviceRoleKey,
      Accept: 'application/json',
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error('Transactional E2E read failed for ' + table + ' (' + response.status + '): ' + body.slice(0, 250));
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(body);
  } catch {
    throw new Error('Transactional E2E read returned invalid JSON for ' + table + '.');
  }
  if (!Array.isArray(decoded)) throw new Error('Transactional E2E read returned a non-array for ' + table + '.');
  return decoded as T[];
}

async function readOrderSnapshot(orderNumber: string): Promise<AuditOrderSnapshot> {
  const rows = await readServiceRows<AuditOrderSnapshot>('orders', {
    select: 'id,order_number,user_id,total,status,payment_status,created_at,order_items(product_id,quantity,price,stock_before,stock_after)',
    order_number: 'eq.' + orderNumber,
  });
  if (rows.length !== 1) {
    throw new Error('Expected exactly one persisted order for ' + orderNumber + ', received ' + rows.length + '.');
  }
  return rows[0];
}

function bogotaDateForTest(value: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) throw new Error('Could not derive the Bogotá reporting date.');
  return year + '-' + month + '-' + day;
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

  test('student completes purchase, admin confirms payment, staff prepares and delivers, inventory and Excel reconcile', async ({ browser, e2eAuth }) => {
    const studentPage = await browser.newPage();
    const studentState = await monitor(studentPage);
    await login(studentPage, 'student', e2eAuth);
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
    if (!orderNumber) throw new Error('The purchase confirmation did not expose an order number.');

    const pendingOrder = await readOrderSnapshot(orderNumber);
    expect(pendingOrder.order_number).toBe(orderNumber);
    expect(pendingOrder.status).toBe('pending');
    expect(pendingOrder.payment_status).toBe('pending');
    expect(Number(pendingOrder.total)).toBeGreaterThan(0);
    expect(pendingOrder.order_items).toHaveLength(1);

    const studentEmail = process.env.PLAYWRIGHT_E2E_EMAIL;
    if (!studentEmail) throw new Error('Missing student E2E identity for ownership verification.');
    const studentProfiles = await readServiceRows<AuditProfile>('profiles', {
      select: 'id,email,role',
      email: 'eq.' + studentEmail,
    });
    expect(studentProfiles).toHaveLength(1);
    expect(studentProfiles[0].role).toBe('student');
    expect(pendingOrder.user_id).toBe(studentProfiles[0].id);

    const item = pendingOrder.order_items[0];
    expect(Number(item.price) * item.quantity).toBeCloseTo(Number(pendingOrder.total), 2);
    expect(Number.isInteger(item.stock_before)).toBeTruthy();
    expect(Number.isInteger(item.stock_after)).toBeTruthy();
    expect((item.stock_before as number) - (item.stock_after as number)).toBe(item.quantity);

    const products = await readServiceRows<AuditProduct>('products', {
      select: 'id,name,stock',
      id: 'eq.' + item.product_id,
    });
    expect(products).toHaveLength(1);
    const product = products[0];

    const movements = await readServiceRows<AuditInventoryMovement>('inventory_movements', {
      select: 'id,product_id,movement_type,quantity,previous_stock,new_stock,created_at,reason',
      product_id: 'eq.' + item.product_id,
      quantity: 'eq.' + item.quantity,
      previous_stock: 'eq.' + item.stock_before,
      new_stock: 'eq.' + item.stock_after,
      created_at: 'gte.' + pendingOrder.created_at,
      order: 'created_at.asc',
    });
    expect(movements, 'the purchase must create one inventory movement with the exact before/after stock transition').toHaveLength(1);
    expect(movements[0].movement_type).toBe('sale');

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

    const approvedOrder = await readOrderSnapshot(orderNumber);
    expect(approvedOrder.payment_status).toBe('confirmed');
    expect(approvedOrder.status).toBe('pending');
    await healthy(adminPage, adminState);

    const staffPage = await browser.newPage();
    const staffState = await monitor(staffPage);
    await login(staffPage, 'staff', e2eAuth);
    await staffPage.goto('/staff');
    await healthy(staffPage, staffState);

    const staffOrder = staffPage.locator('article').filter({ hasText: orderNumber }).first();
    await expect(staffOrder).toBeVisible({ timeout: 30_000 });
    await expect(staffOrder).toContainText('Pendiente');
    await staffOrder.getByRole('button', { name: 'Comenzar preparación', exact: true }).click();
    await expect(staffOrder).toContainText('En preparación');
    await expect(staffOrder.getByRole('button', { name: 'Marcar como listo', exact: true })).toBeVisible();
    await healthy(staffPage, staffState);

    await staffOrder.getByRole('button', { name: 'Marcar como listo', exact: true }).click();
    await expect(staffOrder).toContainText('Listo');
    await expect(staffOrder.getByRole('button', { name: 'Marcar como entregado', exact: true })).toBeVisible();
    await healthy(staffPage, staffState);

    await staffOrder.getByRole('button', { name: 'Marcar como entregado', exact: true }).click();
    await expect.poll(
      () => staffPage.locator('article').filter({ hasText: orderNumber }).count(),
      { timeout: 20_000, message: 'a delivered order must leave the active staff queue' },
    ).toBe(0);
    await healthy(staffPage, staffState);
    await staffPage.close();

    const finalOrder = await readOrderSnapshot(orderNumber);
    expect(finalOrder.status).toBe('delivered');
    expect(finalOrder.payment_status).toBe('confirmed');

    const staffEvents = await readServiceRows<AuditStaffEvent>('audit_logs', {
      select: 'action,actor_id,entity_id,metadata,created_at',
      action: 'eq.order.staff_status_change',
      entity_id: 'eq.' + finalOrder.id,
      order: 'created_at.asc',
    });
    expect(staffEvents).toHaveLength(3);
    expect(staffEvents.map((event) => event.metadata.to)).toEqual(['preparing', 'ready', 'delivered']);
    const actorIds = Array.from(new Set(staffEvents.map((event) => event.actor_id).filter((id): id is string => Boolean(id))));
    expect(actorIds).toHaveLength(1);
    const staffProfiles = await readServiceRows<AuditProfile>('profiles', {
      select: 'id,role',
      id: 'in.(' + actorIds.join(',') + ')',
    });
    expect(staffProfiles).toHaveLength(1);
    expect(staffProfiles[0].role).toBe('staff');

    await adminPage.goto('/admin/orders');
    await adminPage.reload({ waitUntil: 'domcontentloaded' });
    await healthy(adminPage, adminState);
    const orderCard = adminPage.getByTestId('admin-order-' + orderNumber);
    await expect(orderCard).toBeVisible({ timeout: 15_000 });
    await expect(orderCard).toContainText(/Entregado/i);
    await expect(orderCard).toContainText(/Pago:\s*Confirmado/i);

    await adminPage.goto('/admin/inventory');
    await healthy(adminPage, adminState);
    const movementRow = adminPage.locator('tbody tr')
      .filter({ hasText: product.name })
      .filter({ hasText: String(item.stock_before) + ' → ' + String(item.stock_after) })
      .first();
    await expect(movementRow, 'admin inventory history must display the purchase stock movement').toBeVisible({ timeout: 20_000 });
    await expect(movementRow).toContainText(/Venta/i);

    const reportDate = bogotaDateForTest(finalOrder.created_at);
    const reportStart = new Date(reportDate + 'T00:00:00-05:00');
    const reportEnd = new Date(reportStart.getTime() + 24 * 60 * 60 * 1000);
    const dayOrdersRaw = await readServiceRows<DailyOrderAudit>('orders', {
      select: 'order_number,total,payment_status,created_at,order_items(quantity)',
      created_at: 'gte.' + reportStart.toISOString(),
      order: 'created_at.asc',
    });
    const dayOrders = dayOrdersRaw.filter((order) => new Date(order.created_at).getTime() < reportEnd.getTime());
    const confirmedDayOrders = dayOrders.filter((order) => order.payment_status === 'confirmed');
    const expectedConfirmedSales = confirmedDayOrders.reduce((sum, order) => sum + Number(order.total), 0);
    const expectedConfirmedUnits = confirmedDayOrders.reduce(
      (sum, order) => sum + order.order_items.reduce((units, orderItem) => units + Number(orderItem.quantity), 0),
      0,
    );

    await adminPage.goto('/admin/reports');
    await healthy(adminPage, adminState);
    const reportDateInput = adminPage.locator('input[type="date"][aria-label="Fecha de referencia del informe"]');
    await expect(reportDateInput).toBeVisible();
    await reportDateInput.fill(reportDate);
    await expect(adminPage.locator('body')).toContainText(orderNumber, { timeout: 20_000 });

    const downloadPromise = adminPage.waitForEvent('download');
    await adminPage.getByRole('button', { name: 'Descargar Excel', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('quickbite-informe-daily-' + reportDate + '.xlsx');
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const workbook = XLSX.readFile(downloadPath as string);
    expect(workbook.SheetNames).toContain('Resumen');
    expect(workbook.SheetNames).toContain('Ventas');

    const summaryRows = XLSX.utils.sheet_to_json(workbook.Sheets['Resumen'], { header: 1, defval: null }) as unknown[][];
    const metricValue = (name: string) => summaryRows.find((row) => row[0] === name)?.[1];
    expect(Number(metricValue('Ventas confirmadas'))).toBeCloseTo(expectedConfirmedSales, 2);
    expect(Number(metricValue('Pedidos totales'))).toBe(dayOrders.length);
    expect(Number(metricValue('Pedidos confirmados'))).toBe(confirmedDayOrders.length);
    expect(Number(metricValue('Unidades vendidas'))).toBe(expectedConfirmedUnits);

    const salesRows = XLSX.utils.sheet_to_json(workbook.Sheets['Ventas'], { header: 1, defval: null }) as unknown[][];
    const salesHeaders = salesRows[0].map(String);
    const exportedOrder = salesRows.find((row) => row[salesHeaders.indexOf('N.º pedido')] === orderNumber);
    expect(exportedOrder, 'the downloaded Excel must contain the order created by this test').toBeDefined();
    expect(exportedOrder?.[salesHeaders.indexOf('Estado pedido')]).toBe('Entregado');
    expect(exportedOrder?.[salesHeaders.indexOf('Estado pago')]).toBe('Confirmado');
    expect(Number(exportedOrder?.[salesHeaders.indexOf('Total pedido')])).toBeCloseTo(Number(finalOrder.total), 2);
    expect(Number(exportedOrder?.[salesHeaders.indexOf('Unidades')])).toBe(item.quantity);

    await adminPage.close();

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
