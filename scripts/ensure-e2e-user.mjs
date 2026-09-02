const url = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !serviceRoleKey || !anonKey) {
  throw new Error('E2E Supabase configuration is incomplete.');
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
};

async function adminRequest(path, options = {}) {
  const response = await globalThis.fetch(`${url}/auth/v1${path}`, {
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

async function restRequest(path, options = {}) {
  const response = await globalThis.fetch(`${url}/rest/v1${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  });
  if (!response.ok) {
    throw new Error(`Supabase REST ${options.method ?? 'GET'} ${path} failed (${response.status}): ${await response.text()}`);
  }
  return response;
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

const runId = process.env.GITHUB_RUN_ID ?? Date.now().toString();
const configured = [
  ['student', process.env.PLAYWRIGHT_E2E_EMAIL?.trim().toLowerCase(), process.env.PLAYWRIGHT_E2E_PASSWORD],
  ['parent', process.env.PLAYWRIGHT_PARENT_EMAIL?.trim().toLowerCase(), process.env.PLAYWRIGHT_PARENT_PASSWORD],
  ['admin', process.env.PLAYWRIGHT_ADMIN_EMAIL?.trim().toLowerCase(), process.env.PLAYWRIGHT_ADMIN_PASSWORD],
];

const accounts = configured.map(([role, email, password]) => ({
  role,
  email: email || `quickbite-e2e-${role}-${runId}@example.invalid`,
  password: password || `E2e-${runId}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}!`,
}));

const githubEnvPath = process.env.GITHUB_ENV;
const workflowEnv = [];

for (const account of accounts) {
  let user = users.find((candidate) => candidate.email?.toLowerCase() === account.email);

  if (user) {
    user = await adminRequest(`/admin/users/${encodeURIComponent(user.id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        password: account.password,
        email_confirm: true,
        user_metadata: {
          ...(user.user_metadata ?? {}),
          role: account.role,
          full_name: `QuickBite E2E ${account.role}`,
        },
      }),
    });
  } else {
    user = await adminRequest('/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: { role: account.role, full_name: `QuickBite E2E ${account.role}` },
      }),
    });
  }

  await restRequest('/profiles?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      id: user.id,
      email: account.email,
      full_name: `QuickBite E2E ${account.role}`,
      role: account.role,
    }),
  });

  const signInResponse = await globalThis.fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  if (!signInResponse.ok) {
    throw new Error(`E2E ${account.role} login validation failed (${signInResponse.status}): ${await signInResponse.text()}`);
  }

  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::add-mask::${account.email}`);
    console.log(`::add-mask::${account.password}`);
  }

  workflowEnv.push(`PLAYWRIGHT_${account.role.toUpperCase()}_EMAIL=${account.email}`);
  workflowEnv.push(`PLAYWRIGHT_${account.role.toUpperCase()}_PASSWORD=${account.password}`);
  console.log(`E2E ${account.role} account provisioned and login verified.`);
}

if (githubEnvPath) {
  await import('node:fs/promises').then(({ appendFile }) => appendFile(githubEnvPath, `${workflowEnv.join('\n')}\n`));
}
