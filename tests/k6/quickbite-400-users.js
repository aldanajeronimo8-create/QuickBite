/* global __ENV, __VU, __ITER */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const baseUrl = (__ENV.K6_BASE_URL || 'https://quick-bite-snowy-ten.vercel.app').replace(/\/$/, '');
const supabaseUrl = (__ENV.VITE_SUPABASE_URL || 'https://cczbbqxunygcowqfrqdm.supabase.co').replace(/\/$/, '');
const anonKey = __ENV.VITE_SUPABASE_ANON_KEY;
const users = JSON.parse(open(__ENV.K6_USERS_FILE || '/tmp/quickbite-k6-users.json'));
const roles = ['student', 'parent', 'staff', 'admin'];
const flowErrors = new Rate('role_flow_errors');

for (const role of roles) {
  if (!Array.isArray(users.accounts?.[role]) || users.accounts[role].length !== 100) {
    throw new Error('Expected 100 accounts for ' + role);
  }
}
if (!anonKey) throw new Error('VITE_SUPABASE_ANON_KEY is required.');

export const options = {
  scenarios: Object.fromEntries(
    roles.map((role) => [role, {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 25 },
        { duration: '30s', target: 50 },
        { duration: '60s', target: 100 },
        { duration: '120s', target: 100 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
      exec: role + 'Scenario',
      tags: { role },
    }]),
  ),
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<2000', 'p(99)<4000'],
    checks: ['rate>0.985'],
    role_flow_errors: ['rate<0.02'],
    'role_flow_errors{role:student}': ['rate<0.02'],
    'role_flow_errors{role:parent}': ['rate<0.02'],
    'role_flow_errors{role:staff}': ['rate<0.02'],
    'role_flow_errors{role:admin}': ['rate<0.02'],
  },
};

let session = null;

function headers(token, json) {
  const result = { apikey: anonKey };
  if (token) result.Authorization = 'Bearer ' + token;
  if (json) result['Content-Type'] = 'application/json';
  return result;
}

function login(account) {
  const response = http.post(
    supabaseUrl + '/auth/v1/token?grant_type=password',
    JSON.stringify({ email: account.email, password: account.password }),
    { headers: headers(null, true), tags: { name: 'auth_password', role: account.role } },
  );

  const ok = check(response, {
    'auth returns 200': (r) => r.status === 200,
    'auth returns access token': (r) => Boolean(r.json('access_token')),
  });

  return ok ? {
    accessToken: response.json('access_token'),
    userId: response.json('user.id'),
  } : null;
}

function ensureSession(account) {
  if (!session) session = login(account);
  return session;
}

function rest(pathname, token, method, body, role, name) {
  return http.request(
    method,
    supabaseUrl + '/rest/v1' + pathname,
    body || null,
    {
      headers: headers(token, Boolean(body)),
      tags: { name, role },
    },
  );
}

function rpc(name, body, token, role) {
  return rest('/rpc/' + name, token, 'POST', JSON.stringify(body || {}), role, 'rpc_' + name);
}

function profile(account, token) {
  const response = rest(
    '/profiles?id=eq.' + encodeURIComponent(account.user_id) +
      '&select=id,email,role,active,section_id,grade_id,course_id&limit=1',
    token,
    'GET',
    null,
    account.role,
    'profile_self',
  );

  return check(response, {
    'profile returns 200': (r) => r.status === 200,
    'profile matches user and role': (r) => {
      const rows = r.json();
      return Array.isArray(rows) && rows.length === 1 &&
        rows[0].id === account.user_id &&
        rows[0].role === account.role;
    },
    'profile is active': (r) => {
      const rows = r.json();
      return Array.isArray(rows) && rows.length === 1 && rows[0].active === true;
    },
  });
}

function notifications(account, token) {
  const response = rest(
    '/notifications?user_id=eq.' + encodeURIComponent(account.user_id) +
      '&select=id,title,created_at&order=created_at.desc&limit=5',
    token,
    'GET',
    null,
    account.role,
    'notifications_self',
  );
  return check(response, { 'notifications return 200': (r) => r.status === 200 });
}

function adminBoundary(account, token) {
  const response = rpc('admin_list_users', {}, token, account.role);
  return check(response, {
    'admin access matches role': (r) =>
      account.role === 'admin'
        ? r.status === 200
        : [400, 401, 403].includes(r.status),
  });
}

function run(role, flow) {
  const account = users.accounts[role][(__VU - 1) % 100];
  const home = http.get(baseUrl, { tags: { name: 'quickbite_home', role } });
  let ok = check(home, {
    'app returns 200': (r) => r.status === 200,
    'app returns html': (r) =>
      String(r.headers['Content-Type'] || '').toLowerCase().includes('text/html'),
  });

  const auth = ensureSession(account);
  ok = check(auth || {}, {
    'session created': () => Boolean(auth?.accessToken),
  }) && ok;

  if (auth?.accessToken) ok = flow(account, auth.accessToken) && ok;

  if (__ITER === 0) ok = adminBoundary(account, auth?.accessToken) && ok;

  flowErrors.add(!ok, { role });
  sleep(1);
}

function studentScenario() {
  run('student', (account, token) => {
    let ok = profile(account, token);

    ok = check(rpc(
      'get_or_create_student_code',
      { p_force_new: false, p_student_user_id: account.user_id },
      token, 'student',
    ), {
      'student code works': (r) => r.status === 200,
    }) && ok;

    ok = check(rpc('get_student_recess_status', {}, token, 'student'), {
      'student recess works': (r) => r.status === 200,
    }) && ok;

    ok = check(rpc('qb_products_available_for_current_student', {}, token, 'student'), {
      'student products work': (r) => r.status === 200,
    }) && ok;

    return notifications(account, token) && ok;
  });
}

function parentScenario() {
  run('parent', (account, token) => {
    let ok = profile(account, token);
    const active = rpc('get_parent_active_student', {}, token, 'parent');
    const payload = active.status === 200 ? active.json() : null;
    const row = Array.isArray(payload) ? payload[0] : payload;
    const studentId = row?.student_user_id || account.student_user_id;

    ok = check(active, {
      'parent active student works': (r) => r.status === 200,
      'parent has linked student': () => Boolean(studentId),
    }) && ok;

    if (!studentId) return false;

    ok = check(rpc(
      'get_parent_family_dashboard',
      { p_student_user_id: studentId },
      token, 'parent',
    ), {
      'parent family dashboard works': (r) => r.status === 200,
    }) && ok;

    ok = check(rpc(
      'get_parent_student_spending_summary',
      { p_student_user_id: studentId },
      token, 'parent',
    ), {
      'parent spending summary works': (r) => r.status === 200,
    }) && ok;

    ok = check(rpc(
      'get_parent_food_controls',
      { p_student_user_id: studentId },
      token, 'parent',
    ), {
      'parent food controls work': (r) => r.status === 200,
    }) && ok;

    return notifications(account, token) && ok;
  });
}

function staffScenario() {
  run('staff', (account, token) => {
    let ok = profile(account, token);
    ok = check(rpc('staff_list_active_orders', {}, token, 'staff'), {
      'staff active orders work': (r) => r.status === 200,
    }) && ok;
    return notifications(account, token) && ok;
  });
}

function adminScenario() {
  run('admin', (account, token) => {
    let ok = profile(account, token);

    ok = check(rpc('list_admin_orders', {}, token, 'admin'), {
      'admin orders work': (r) => r.status === 200,
    }) && ok;

    if (__ITER === 0) {
      ok = check(rpc('admin_list_users', {}, token, 'admin'), {
        'admin users work': (r) => r.status === 200,
      }) && ok;

      ok = check(rpc(
        'get_admin_dashboard_intelligence',
        { p_days: 7 },
        token, 'admin',
      ), {
        'admin intelligence works': (r) => r.status === 200,
      }) && ok;
    }

    return notifications(account, token) && ok;
  });
}

export { studentScenario, parentScenario, staffScenario, adminScenario };
