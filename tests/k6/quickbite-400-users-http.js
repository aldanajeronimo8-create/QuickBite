import http from 'k6/http';
import { check, sleep } from 'k6';

const role = (__ENV.K6_ROLE || '').toLowerCase();
const base = (__ENV.K6_BASE_URL || 'https://quick-bite-snowy-ten.vercel.app').replace(/\/$/, '');
const supabase = (__ENV.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const anon = __ENV.VITE_SUPABASE_ANON_KEY;
const accounts = {
  student: { email: __ENV.K6_STUDENT_EMAIL, password: __ENV.K6_STUDENT_PASSWORD },
  parent: { email: __ENV.K6_PARENT_EMAIL, password: __ENV.K6_PARENT_PASSWORD },
  staff: { email: __ENV.K6_STAFF_EMAIL, password: __ENV.K6_STAFF_PASSWORD },
  admin: { email: __ENV.K6_ADMIN_EMAIL, password: __ENV.K6_ADMIN_PASSWORD },
};
const routes = {
  student: ['/student/features','/menu?tab=menu','/menu?tab=orders','/student/reviews','/student/order-windows','/student/account','/student/wallet','/student/history','/student/rewards','/student/favorites','/student/link-code','/student/notifications'],
  parent: ['/parent/family','/parent/food-controls','/parent/wellbeing'],
  staff: ['/staff','/staff/orders'],
  admin: ['/admin','/admin/features','/admin/operations','/admin/rankings','/admin/reviews','/admin/orders','/admin/payments','/admin/wallet','/admin/inventory','/admin/menu','/admin/nutrition','/admin/verification','/admin/users','/admin/academic','/admin/recess','/admin/loyalty','/admin/reports','/admin/history','/admin/system','/admin/reset'],
};
export const options = { vus: 100, iterations: 100, maxDuration: '10m', thresholds: { checks: ['rate>0.995'], http_req_failed: ['rate<0.01'] }, tags: { test: 'distributed-400-user-http-load' } };
export function setup() {
  if (!accounts[role] || !accounts[role].email || !accounts[role].password) throw new Error('Missing credentials for ' + role);
  if (!supabase || !anon) throw new Error('Missing Supabase configuration');
  const r = http.post(supabase + '/auth/v1/token?grant_type=password', JSON.stringify(accounts[role]), { headers: { apikey: anon, 'Content-Type': 'application/json' }, timeout: '30s' });
  check(r, { 'role login succeeds': x => x.status === 200 && Boolean(x.json('access_token')) });
  if (r.status !== 200) throw new Error('Authentication failed for ' + role);
  return { token: r.json('access_token') };
}
export default function (data) {
  const headers = { Authorization: 'Bearer ' + data.token };
  for (const route of routes[role]) {
    const r = http.get(base + route, { headers, tags: { role, route } });
    check(r, { 'route returns below 500': x => x.status > 0 && x.status < 500 });
  }
  sleep(0.2);
}
