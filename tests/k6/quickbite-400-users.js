/* global __ENV */
import { browser } from 'k6/browser';
import http from 'k6/http';
import { check } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

const BASE_URL = (__ENV.K6_BASE_URL || 'https://quick-bite-snowy-ten.vercel.app').replace(/\/$/, '');
const SUPABASE_URL = (__ENV.VITE_SUPABASE_URL || 'https://cczbbqxunygcowqfrqdm.supabase.co').replace(/\/$/, '');
const ANON_KEY = __ENV.VITE_SUPABASE_ANON_KEY;

const accounts = {
  student: { email: __ENV.K6_STUDENT_EMAIL, password: __ENV.K6_STUDENT_PASSWORD },
  parent: { email: __ENV.K6_PARENT_EMAIL, password: __ENV.K6_PARENT_PASSWORD },
  staff: { email: __ENV.K6_STAFF_EMAIL, password: __ENV.K6_STAFF_PASSWORD },
  admin: { email: __ENV.K6_ADMIN_EMAIL, password: __ENV.K6_ADMIN_PASSWORD },
};

const failures = new Rate('ui_function_failures');
const controlsChecked = new Counter('ui_controls_checked');
const controlsClicked = new Counter('ui_controls_clicked');
const controlsTrialOnly = new Counter('ui_controls_trial_only');
const routesChecked = new Counter('ui_routes_checked');
const routeLatency = new Trend('ui_route_latency', true);
const browserHttpFailures = new Rate('browser_http_failures');
const browserNetworkFailures = new Counter('browser_network_failures');

const ROLE_ROUTES = {
  student: [
    '/login?preview_role=student',
    '/student/features',
    '/menu?tab=menu',
    '/menu?tab=orders',
    '/student/reviews',
    '/student/order-windows',
    '/student/account',
    '/student/wallet',
    '/student/history',
    '/student/rewards',
    '/student/favorites',
    '/student/link-code',
    '/student/notifications',
  ],
  parent: [
    '/login?preview_role=parent',
    '/parent/family',
    '/parent/food-controls',
    '/parent/wellbeing',
  ],
  staff: [
    '/login?preview_role=staff',
    '/staff',
    '/staff/orders',
  ],
  admin: [
    '/login?preview_role=admin',
    '/admin',
    '/admin/features',
    '/admin/operations',
    '/admin/rankings',
    '/admin/reviews',
    '/admin/orders',
    '/admin/payments',
    '/admin/wallet',
    '/admin/inventory',
    '/admin/menu',
    '/admin/nutrition',
    '/admin/verification',
    '/admin/users',
    '/admin/academic',
    '/admin/recess',
    '/admin/loyalty',
    '/admin/reports',
    '/admin/history',
    '/admin/system',
    '/admin/reset',
  ],
};

const SAFE_ACTION_PATTERNS = [
  /\bvolver\b/i,
  /\bregresar\b/i,
  /\batrás\b/i,
  /\bmostrar\b/i,
  /\bocultar\b/i,
  /\babrir\b/i,
  /\bexpandir\b/i,
  /\bcerrar\b/i,
  /\bfiltrar\b/i,
  /\bbuscar\b/i,
  /\bactualizar\b/i,
  /\brefrescar\b/i,
  /\bver\b/i,
  /\bdetalle\b/i,
  /\bseleccionar\b/i,
  /\bmodo\b/i,
  /\bpestaña\b/i,
  /\bmenú\b/i,
  /\bhistorial\b/i,
  /\bnotificaciones\b/i,
  /\bfavoritos\b/i,
  /\brecuperar\b/i,
  /\bestudiante\b/i,
  /\bpadre\b/i,
  /\bpersonal de cafetería\b/i,
  /\badministración\b/i,
];

const MUTATING_PATTERNS = [
  /\bguardar\b/i,
  /\bcrear\b/i,
  /\beliminar\b/i,
  /\bborrar\b/i,
  /\breiniciar\b/i,
  /\breset\b/i,
  /\baprobar\b/i,
  /\brechazar\b/i,
  /\bcanjear\b/i,
  /\bcomprar\b/i,
  /\bpagar\b/i,
  /\brecargar\b/i,
  /\bsolicitar\b/i,
  /\bmarcar\b/i,
  /\bdesactivar\b/i,
  /\bactivar\b/i,
  /\bcerrar período\b/i,
  /\bcomenzar preparación\b/i,
  /\blisto\b/i,
  /\bentregado\b/i,
  /\benviar\b/i,
  /\bactualizar producto\b/i,
  /\bguardar cambios\b/i,
  /\bconfirmar\b/i,
];

for (const role of Object.keys(accounts)) {
  if (!accounts[role].email || !accounts[role].password) {
    throw new Error('Missing k6 credentials for ' + role);
  }
}
if (!ANON_KEY) throw new Error('Missing VITE_SUPABASE_ANON_KEY');

export const options = {
  scenarios: Object.fromEntries(
    Object.keys(accounts).map((role) => [
      role,
      {
        executor: 'per-vu-iterations',
        vus: 100,
        iterations: 1,
        maxDuration: '12m',
        exec: role + 'BrowserAudit',
        tags: { role, test: 'ui-full-function-sweep' },
        options: { browser: { type: 'chromium' } },
      },
    ]),
  ),
  thresholds: {
    checks: ['rate>0.995'],
    ui_function_failures: ['rate<0.01'],
    browser_http_failures: ['rate<0.01'],
    'checks{role:student}': ['rate>0.995'],
    'checks{role:parent}': ['rate>0.995'],
    'checks{role:staff}': ['rate>0.995'],
    'checks{role:admin}': ['rate>0.995'],
    'ui_function_failures{role:student}': ['rate<0.01'],
    'ui_function_failures{role:parent}': ['rate<0.01'],
    'ui_function_failures{role:staff}': ['rate<0.01'],
    'ui_function_failures{role:admin}': ['rate<0.01'],
  },
};

async function login(role) {
  const account = accounts[role];
  const response = httpPostLogin(account);
  if (!response || !response.accessToken) {
    throw new Error('Unable to obtain session for ' + role);
  }
  return response;
}

function httpPostLogin(account) {
  const response = http.post(
    SUPABASE_URL + '/auth/v1/token?grant_type=password',
    JSON.stringify({ email: account.email, password: account.password }),
    {
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      timeout: '30s',
    },
  );

  if (response.status !== 200) return null;

  return {
    accessToken: JSON.parse(response.body).access_token,
    refreshToken: JSON.parse(response.body).refresh_token,
    expiresIn: JSON.parse(response.body).expires_in,
    expiresAt: JSON.parse(response.body).expires_at,
    tokenType: JSON.parse(response.body).token_type,
    user: JSON.parse(response.body).user,
  };
}

function classifyControl(meta) {
  const label = [meta.text, meta.aria, meta.title, meta.name, meta.type]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (MUTATING_PATTERNS.some((pattern) => pattern.test(label))) return 'mutating';
  if (SAFE_ACTION_PATTERNS.some((pattern) => pattern.test(label))) return 'safe';
  if (meta.type === 'submit' || meta.type === 'button') return 'unknown-button';
  return 'other';
}

async function setSession(page, role, session) {
  await page.goto(BASE_URL + '/login?preview_role=' + role, {
    waitUntil: 'domcontentloaded',
  });

  const storage = {
    session,
    context: role === 'admin' ? 'admin' : 'user',
  };

  await page.evaluate((payload) => {
    sessionStorage.setItem(
      payload.context === 'admin' ? 'quickbite.admin.auth' : 'quickbite.user.auth',
      JSON.stringify(payload.session),
    );
    sessionStorage.setItem('quickbite.auth.context', payload.context);
  }, storage);

  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function safeClick(page, locator) {
  await locator.click({ timeout: 10000 });
}

async function collectMeta(locator) {
  return locator.evaluate((element) => ({
    text: (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 180),
    aria: element.getAttribute('aria-label') || '',
    title: element.getAttribute('title') || '',
    name: element.getAttribute('name') || '',
    type: element.getAttribute('type') || '',
    testId: element.getAttribute('data-testid') || '',
    disabled: element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true',
  }));
}

async function probeControls(page, role, route) {
  const selector =
    'button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]';
  const initial = await page.locator(selector).all();

  for (let i = 0; i < initial.length; i += 1) {
    // Reopen each route so state changes from a previous click do not hide the next control.
    if (i > 0) {
      await page.goto(BASE_URL + route, { waitUntil: 'domcontentloaded' });
    }

    const controls = await page.locator(selector).all();
    if (i >= controls.length) continue;

    const control = controls[i];
    const meta = await collectMeta(control);
    controlsChecked.add(1, { role });
    const category = classifyControl(meta);

    if (meta.disabled) {
      check(meta, {
        'disabled controls remain discoverable': () => meta.disabled === true,
      });
      continue;
    }

    try {
      await control.click({ trial: true, timeout: 10000 });
    } catch (error) {
      failures.add(true, { role });
      console.error(
        'CONTROL_TRIAL_FAILED',
        role,
        route,
        JSON.stringify(meta),
        String(error),
      );
      continue;
    }

    if (category === 'safe') {
      try {
        await safeClick(page, control);
        controlsClicked.add(1, { role });
        await page.waitForTimeout(150);
        const bodyText = (await page.locator('body').textContent() || '').toLowerCase();
        const appError =
          bodyText.includes('unexpected error') ||
          bodyText.includes('application error') ||
          bodyText.includes('something went wrong');

        check({ appError }, {
          'safe control does not show application error': (v) => v.appError === false,
        });

        if (appError) failures.add(true, { role });
      } catch (error) {
        failures.add(true, { role });
        console.error(
          'CONTROL_CLICK_FAILED',
          role,
          route,
          JSON.stringify(meta),
          String(error),
        );
      }
    } else {
      controlsTrialOnly.add(1, { role });
    }
  }
}

async function probeLinks(page, role, route) {
  const links = await page.locator('a[href]').all();
  for (let i = 0; i < links.length; i += 1) {
    const meta = await collectMeta(links[i]);
    const href = await links[i].evaluate((element) => element.getAttribute('href') || '');
    const internal = href.startsWith('/') && !href.startsWith('//');

    if (!internal || href.startsWith('/logout')) continue;

    controlsChecked.add(1, { role, kind: 'link' });

    const response = await page.goto(BASE_URL + href, {
      waitUntil: 'domcontentloaded',
    });

    const ok = Boolean(response) && response.status < 500;

    check(
      { ok, href, meta },
      { 'internal link resolves below 500': (v) => v.ok === true },
    );

    if (!ok) failures.add(true, { role });

    await page.goto(BASE_URL + route, { waitUntil: 'domcontentloaded' });
  }
}

async function probeFormControls(page, role, route) {
  const controls = await page.locator(
    'input:not([type="hidden"]), textarea, select, [contenteditable="true"]',
  ).all();

  for (let i = 0; i < controls.length; i += 1) {
    const field = controls[i];
    const meta = await collectMeta(field);
    controlsChecked.add(1, { role, kind: 'form' });

    try {
      await field.click({ trial: true, timeout: 10000 });

      const tag = await field.evaluate((el) => el.tagName.toLowerCase());
      const type = (await field.evaluate((el) => el.getAttribute('type') || 'text')).toLowerCase();

      if (['text', 'email', 'search', 'tel', 'url'].includes(type) || tag === 'textarea') {
        await field.fill('k6-test-value');
      } else if (tag === 'select') {
        const optionCount = await field.locator('option').count();
        if (optionCount > 0) await field.selectOption({ index: 0 });
      }

      check(meta, {
        'form control is actionable': () => meta.disabled !== true,
      });
    } catch (error) {
      failures.add(true, { role });
      console.error(
        'FORM_CONTROL_FAILED',
        role,
        route,
        JSON.stringify(meta),
        String(error),
      );
    }

    if (i < controls.length - 1) {
      await page.goto(BASE_URL + route, { waitUntil: 'domcontentloaded' });
    }
  }
}

async function auditRoute(page, role, route) {
  const started = Date.now();

  await page.goto(BASE_URL + route, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  await page.waitForTimeout(300);
  routesChecked.add(1, { role });

  const url = await page.url();
  const bodyText = (await page.locator('body').textContent() || '').trim();

  check(
    { url, bodyText },
    {
      'route loads without blank application shell': (v) =>
        v.url.includes(BASE_URL) && v.bodyText.length > 40,
    },
  );

  await probeControls(page, role, route);
  await page.goto(BASE_URL + route, { waitUntil: 'domcontentloaded' });
  await probeLinks(page, role, route);
  await page.goto(BASE_URL + route, { waitUntil: 'domcontentloaded' });
  await probeFormControls(page, role, route);

  routeLatency.add(Date.now() - started, { role, route });
}

export function setup() {
  return {
    student: login('student'),
    parent: login('parent'),
    staff: login('staff'),
    admin: login('admin'),
  };
}

async function runBrowserAudit(role, sessionData) {
  const page = await browser.newPage();

  const consoleErrors = [];
  page.on('console', (message) => {
    const type = message.type();
    if (type === 'error') consoleErrors.push(message.text());
  });

  const httpErrors = [];
  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400) {
      const url = response.url();
      const request = response.request();
      const resourceType = request.resourceType();
      if (resourceType === 'document' || resourceType === 'fetch' || resourceType === 'xhr') {
        httpErrors.push({
          status,
          method: request.method(),
          url,
          resourceType,
        });
        browserHttpFailures.add(true, { role });
      }
    }
  });

  page.on('requestfailed', (request) => {
    browserNetworkFailures.add(1, { role });
    console.error(
      'BROWSER_REQUEST_FAILED',
      role,
      request.method(),
      request.url(),
      JSON.stringify(request.failure() || {}),
    );
  });

  try {
    await auditRoute(page, role, ROLE_ROUTES[role][0]);

    await setSession(page, role, sessionData);

    for (const route of ROLE_ROUTES[role].slice(1)) {
      try {
        await auditRoute(page, role, route);
      } catch (error) {
        failures.add(true, { role });
        console.error('ROUTE_AUDIT_FAILED', role, route, String(error));
      }
    }

    check(
      { consoleErrors, httpErrors },
      {
        'no browser console errors were emitted': (v) => v.consoleErrors.length === 0,
        'no document/fetch/xhr response errors were emitted': (v) => v.httpErrors.length === 0,
      },
    );

    if (consoleErrors.length || httpErrors.length) failures.add(true, { role });
  } finally {
    await page.close();
  }
}

export async function studentBrowserAudit(data) {
  await runBrowserAudit('student', data.student);
}

export async function parentBrowserAudit(data) {
  await runBrowserAudit('parent', data.parent);
}

export async function staffBrowserAudit(data) {
  await runBrowserAudit('staff', data.staff);
}

export async function adminBrowserAudit(data) {
  await runBrowserAudit('admin', data.admin);
}
