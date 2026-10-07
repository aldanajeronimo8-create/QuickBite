/* global __ENV, __VU, __ITER */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = (__ENV.K6_BASE_URL || 'https://quick-bite-snowy-ten.vercel.app').replace(/\/$/, '');
const SUPABASE_URL = (__ENV.VITE_SUPABASE_URL || 'https://cczbbqxunygcowqfrqdm.supabase.co').replace(/\/$/, '');
const ANON_KEY = __ENV.VITE_SUPABASE_ANON_KEY;

const credentials = {
  student: { email: __ENV.K6_STUDENT_EMAIL, password: __ENV.K6_STUDENT_PASSWORD },
  parent: { email: __ENV.K6_PARENT_EMAIL, password: __ENV.K6_PARENT_PASSWORD },
  staff: { email: __ENV.K6_STAFF_EMAIL, password: __ENV.K6_STAFF_PASSWORD },
  admin: { email: __ENV.K6_ADMIN_EMAIL, password: __ENV.K6_ADMIN_PASSWORD },
};

const roles = Object.keys(credentials);
const roleErrors = new Rate('role_flow_errors');

for (const role of roles) {
  if (!credentials[role].email || !credentials[role].password) {
    throw new Error('Missing k6 credentials for role: ' + role);
  }
}
if (!ANON_KEY) throw new Error('VITE_SUPABASE_ANON_KEY is required.');

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

function login(account) {
  const response = http.post(
    SUPABASE_URL + '/auth/v1/token?grant_type=password',
    JSON.stringify({ email: account.email, password: account.password }),
    {
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      tags: { name: 'auth_password_setup', role: account.role },
    },
  );

  if (!check(response, {
    'setup auth returns 200': (r) => r.status === 200,
    'setup auth returns token': (r) => Boolean(r.json('access_token')),
  })) {
    throw new Error('k6 setup login failed for ' + account.role);
  }

  return {
    accessToken: response.json('access_token'),
    userId: response.json('user.id'),
  };
}

export function setup() {
  return Object.fromEntries(
    roles.map((role) => [role, login({ ...credentials[role], role })]),
  );
}

function headers(token, json) {
  const result = { apikey: ANON_KEY };
  if (token) result.Authorization = 'Bearer ' + token;
  if (json) result['Content-Type'] = 'application/json';
  return result;
}

function rest(pathname, token, method, body, role, name) {
  return http.request(
    method,
    SUPABASE_URL + '/rest/v1' + pathname,
    body || null,
    { headers: headers(token, Boolean(body)), tags: { name, role } },
  );
}

function rpc(name, body, token, role) {
  return rest(
    '/rpc/' + name,
    token,
    'POST',
    JSON.stringify(body || {}),
    role,
    'rpc_' + name,
  );
}

function appShell(role) {
  const response = http.get(BASE_URL, { tags: { name: 'quickbite_home', role } });
  return check(response, {
    'QuickBite returns 200': (r) => r.status === 200,
    'QuickBite returns HTML': (r) =>
      String(r.headers['Content-Type'] || '').toLowerCase().includes('text/html'),
  });
}

function profile(role, token, userId) {
  const response = rest(
    '/profiles?id=eq.' + encodeURIComponent(userId) +
      '&select=id,email,role,active,section_id,grade_id,course_id&limit=1',
    token, 'GET', null, role, 'profile_self',
  );

  return check(response, {
    'profile request succeeds': (r) => r.status === 200,
    'profile belongs to current user': (r) => {
      const rows = r.json();
      return Array.isArray(rows) && rows.length === 1 && rows[0].id === userId;
    },
    'profile role is correct': (r) => {
      const rows = r.json();
      const actual = rows?.[0]?.role;
      const matches =
        role === 'student'
          ? ['student', 'both', 'student_parent'].includes(actual)
          : actual === role;
      return Array.isArray(rows) && rows.length === 1 && matches;
    },
    'profile is active': (r) => {
      const rows = r.json();
      return Array.isArray(rows) && rows.length === 1 && rows[0].active === true;
    },
  });
}

function notifications(role, token, userId) {
  const response = rest(
    '/notifications?user_id=eq.' + encodeURIComponent(userId) +
      '&select=id,title,created_at&order=created_at.desc&limit=5',
    token, 'GET', null, role, 'notifications_self',
  );
  return check(response, { 'notifications request succeeds': (r) => r.status === 200 });
}

function adminBoundary(role, token) {
  const response = rpc('admin_list_users', {}, token, role);
  return check(response, {
    'admin authorization matches role': (r) =>
      role === 'admin' ? r.status === 200 : [400, 401, 403].includes(r.status),
  });
}

function run(role, auth, flow) {
  let ok = appShell(role);
  ok = check(auth || {}, {
    'authenticated virtual user is ready': () => Boolean(auth?.accessToken && auth?.userId),
  }) && ok;

  if (auth?.accessToken) ok = flow(auth) && ok;
  if (__ITER === 0 && auth?.accessToken) {
    ok = adminBoundary(role, auth.accessToken) && ok;
  }

  roleErrors.add(!ok, { role });
  sleep(1);
}

function studentScenario(data) {
  run('student', data.student, (auth) => {
    let ok = profile('student', auth.accessToken, auth.userId);

    ok = check(
      rpc('get_student_recess_status', {}, auth.accessToken, 'student'),
      { 'student recess interface works': (r) => r.status === 200 },
    ) && ok;

    ok = check(
      rpc('qb_products_available_for_current_student', {}, auth.accessToken, 'student'),
      { 'student menu interface works': (r) => r.status === 200 },
    ) && ok;

    return notifications('student', auth.accessToken, auth.userId) && ok;
  });
}

function parentScenario(data) {
  run('parent', data.parent, (auth) => {
    let ok = profile('parent', auth.accessToken, auth.userId);
    const active = rpc('get_parent_active_student', {}, auth.accessToken, 'parent');
    const payload = active.status === 200 ? active.json() : null;
    const row = Array.isArray(payload) ? payload[0] : payload;
    const studentId = row?.student_user_id;

    ok = check(active, {
      'parent active-student lookup works': (r) => r.status === 200,
      'parent has an active student': () => Boolean(studentId),
    }) && ok;

    if (studentId) {
      ok = check(
        rpc('get_parent_family_dashboard', { p_student_user_id: studentId }, auth.accessToken, 'parent'),
        { 'parent family dashboard works': (r) => r.status === 200 },
      ) && ok;

      ok = check(
        rpc('get_parent_student_spending_summary', { p_student_user_id: studentId }, auth.accessToken, 'parent'),
        { 'parent spending summary works': (r) => r.status === 200 },
      ) && ok;

      ok = check(
        rpc('get_parent_food_controls', { p_student_user_id: studentId }, auth.accessToken, 'parent'),
        { 'parent food controls work': (r) => r.status === 200 },
      ) && ok;
    }

    return notifications('parent', auth.accessToken, auth.userId) && ok;
  });
}

function staffScenario(data) {
  run('staff', data.staff, (auth) => {
    let ok = profile('staff', auth.accessToken, auth.userId);
    ok = check(
      rpc('staff_list_active_orders', {}, auth.accessToken, 'staff'),
      { 'staff orders interface works': (r) => r.status === 200 },
    ) && ok;
    return notifications('staff', auth.accessToken, auth.userId) && ok;
  });
}

function adminScenario(data) {
  run('admin', data.admin, (auth) => {
    let ok = profile('admin', auth.accessToken, auth.userId);

    ok = check(
      rpc('list_admin_orders', {}, auth.accessToken, 'admin'),
      { 'admin orders interface works': (r) => r.status === 200 },
    ) && ok;

    if (__ITER === 0) {
      ok = check(
        rpc('admin_list_users', {}, auth.accessToken, 'admin'),
        { 'admin users interface works': (r) => r.status === 200 },
      ) && ok;

      ok = check(
        rpc('get_admin_dashboard_intelligence', { p_days: 7 }, auth.accessToken, 'admin'),
        { 'admin dashboard intelligence works': (r) => r.status === 200 },
      ) && ok;
    }

    return notifications('admin', auth.accessToken, auth.userId) && ok;
  });
}

export { studentScenario, parentScenario, staffScenario, adminScenario };
