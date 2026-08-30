const url = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const email = process.env.PLAYWRIGHT_E2E_EMAIL?.trim().toLowerCase();
const password = process.env.PLAYWRIGHT_E2E_PASSWORD;

if (!url || !serviceRoleKey || !anonKey || !email || !password) {
  throw new Error('E2E Supabase configuration is incomplete.');
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
};

async function adminRequest(path, options = {}) {
  const response = await fetch(`${url}/auth/v1${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    throw new Error(`Supabase Admin ${options.method ?? 'GET'} ${path} failed (${response.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

let users = [];
let page = 1;
while (true) {
  const body = await adminRequest(`/admin/users?page=${page}&per_page=100`);
  const batch = Array.isArray(body?.users) ? body.users : [];
  users.push(...batch);
  if (batch.length < 100) break;
  page += 1;
}

let user = users.find((candidate) => candidate.email?.toLowerCase() === email);

if (user) {
  user = await adminRequest(`/admin/users/${encodeURIComponent(user.id)}`, {
    method: 'PUT',
    body: JSON.stringify({
      password,
      email_confirm: true,
      user_metadata: {
        ...(user.user_metadata ?? {}),
        role: 'student',
        full_name: 'QuickBite E2E Student',
      },
    }),
  });
} else {
  user = await adminRequest('/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'student', full_name: 'QuickBite E2E Student' },
    }),
  });
}

const profileResponse = await fetch(`${url}/rest/v1/profiles?on_conflict=id`, {
  method: 'POST',
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  },
  body: JSON.stringify({
    id: user.id,
    email,
    full_name: 'QuickBite E2E Student',
    role: 'student',
  }),
});
if (!profileResponse.ok) {
  throw new Error(`Supabase profile upsert failed (${profileResponse.status}): ${await profileResponse.text()}`);
}

const signInResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: anonKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (!signInResponse.ok) {
  throw new Error(`E2E login validation failed (${signInResponse.status}): ${await signInResponse.text()}`);
}

console.log(`E2E user ready and login verified: ${email}`);
