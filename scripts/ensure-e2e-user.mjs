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

const ADMIN_READ_MAX_ATTEMPTS = 4;
const ADMIN_READ_TIMEOUT_MS = 20_000;

async function adminRequest(path, options = {}) {
  const isRead = (options.method ?? 'GET').toUpperCase() === 'GET';
  let lastError = null;

  for (let attempt = 1; attempt <= (isRead ? ADMIN_READ_MAX_ATTEMPTS : 1); attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ADMIN_READ_TIMEOUT_MS);

    try {
      const response = await globalThis.fetch(`${url}/auth/v1${path}`, {
        ...options,
        signal: controller.signal,
        headers: { ...headers, ...(options.headers ?? {}) },
      });
      const text = await response.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = text; }

      if (response.ok) return body;

      const message = `Supabase Admin ${options.method ?? 'GET'} ${path} failed (${response.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`;
      const transient = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!isRead || !transient || attempt === ADMIN_READ_MAX_ATTEMPTS) {
        throw new Error(message);
      }

      lastError = new Error(message);
      const delayMs = 500 * (2 ** (attempt - 1));
      console.warn(`Supabase Admin GET ${path} returned ${response.status}; retrying in ${delayMs}ms (attempt ${attempt + 1}/${ADMIN_READ_MAX_ATTEMPTS}).`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      const message = aborted
        ? `Supabase Admin ${options.method ?? 'GET'} ${path} timed out after ${ADMIN_READ_TIMEOUT_MS}ms.`
        : error instanceof Error
          ? error.message
          : String(error);

      const retryable = isRead;
      if (!retryable || attempt === ADMIN_READ_MAX_ATTEMPTS) {
        throw new Error(message);
      }

      lastError = new Error(message);
      const delayMs = 500 * (2 ** (attempt - 1));
      console.warn(`Supabase Admin GET ${path} did not complete; retrying in ${delayMs}ms (attempt ${attempt + 1}/${ADMIN_READ_MAX_ATTEMPTS}).`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error(`Supabase Admin GET ${path} failed unexpectedly.`);
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

async function validateProtectedProfile(userId, role) {
  const response = await globalThis.fetch(
    `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id`,
    { method: 'GET', headers },
  );
  if (!response.ok) {
    throw new Error(`Protected E2E ${role} profile validation failed (${response.status}): ${await response.text()}`);
  }
  const profiles = await response.json();
  if (!Array.isArray(profiles) || profiles.length === 0) {
    throw new Error(`Protected E2E ${role} account exists but its profile is missing; refusing to mutate a protected account.`);
  }
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
  let isProtected = false;

  if (user) {
    try {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('protected_account_cannot_be_changed')) throw error;
      isProtected = true;
      console.log(`E2E ${account.role} account is protected; keeping its existing credentials and metadata.`);
    }
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

  if (isProtected) {
    await validateProtectedProfile(user.id, account.role);
  } else {
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
  }

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
