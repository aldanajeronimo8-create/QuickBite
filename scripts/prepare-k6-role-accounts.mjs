const base = process.env.VITE_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const studentEmail = process.env.PLAYWRIGHT_E2E_EMAIL;
const studentPassword = process.env.PLAYWRIGHT_E2E_PASSWORD;

if (!base || !serviceRole || !anonKey || !studentEmail || !studentPassword) {
  throw new Error('400-user load preparation configuration is incomplete.');
}

const fixedAccounts = {
  parent: {
    email: 'quickbite-e2e-parent-35249460578@example.invalid',
    role: 'parent',
  },
  staff: {
    email: 'quickbite-e2e-staff-37552689256@example.invalid',
    role: 'staff',
  },
  admin: {
    email: 'quickbite-e2e-admin-35249460578@example.invalid',
    role: 'admin',
  },
};

const authHeaders = {
  apikey: serviceRole,
  Authorization: 'Bearer ' + serviceRole,
  'Content-Type': 'application/json',
};

async function request(pathname, options = {}) {
  const response = await fetch(base + pathname, {
    ...options,
    headers: { ...authHeaders, ...(options.headers || {}) },
  });

  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }

  if (!response.ok) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(
      'Supabase ' + (options.method || 'GET') + ' ' + pathname +
      ' failed (' + response.status + '): ' + text,
    );
  }

  return body;
}

async function rest(pathname, options = {}) {
  return request('/rest/v1' + pathname, options);
}

async function auth(pathname, options = {}) {
  return request('/auth/v1' + pathname, options);
}

async function withRetry(task, label, attempts = 4) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;

      const delayMs = 1000 * attempt;
      console.warn(label + ' failed; retrying in ' + delayMs + 'ms.');
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

async function setPassword(account, password) {
  await withRetry(
    () => auth('/admin/users/' + encodeURIComponent(account.id), {
      method: 'PUT',
      body: JSON.stringify({
        password,
        email_confirm: true,
      }),
    }),
    'Password rotation for ' + account.email,
  );
}

async function verifyProfile(email, role) {
  const rows = await rest(
    '/profiles?email=eq.' + encodeURIComponent(email) +
      '&select=id,email,role,active&limit=1',
  );

  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error('Expected one profile for ' + email + '.');
  }

  const profile = rows[0];
  const roleMatches =
    role === 'student'
      ? ['student', 'both', 'student_parent'].includes(profile.role)
      : profile.role === role;

  if (!roleMatches || profile.active !== true) {
    throw new Error(
      'Role/profile mismatch for ' + email + ': ' + JSON.stringify(profile),
    );
  }

  return profile.id;
}

async function findAuthUserByEmail(email) {
  for (let page = 1; ; page += 1) {
    const body = await auth('/admin/users?page=' + page + '&per_page=100');
    const users = Array.isArray(body?.users) ? body.users : [];
    const match = users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());

    if (match) return match;
    if (users.length < 100) break;
  }

  throw new Error('Auth user not found for ' + email);
}

async function login(email, password, role) {
  const response = await fetch(
    base + '/auth/v1/token?grant_type=password',
    {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
  );

  if (!response.ok) {
    throw new Error(
      'Password login validation failed for ' + role +
      ' (' + response.status + '): ' + await response.text(),
    );
  }
}

async function main() {
  const accounts = {
    student: {
      email: studentEmail,
      password: studentPassword,
    },
  };

  for (const [role, account] of Object.entries(fixedAccounts)) {
    const user = await findAuthUserByEmail(account.email);
    const password = 'QuickBite400-' + role + '-' + crypto.randomUUID() + '!';
    await verifyProfile(account.email, role);
    await setPassword(user, password);
    await login(account.email, password, role);
    accounts[role] = { email: account.email, password };
  }

  await verifyProfile(studentEmail, 'student');
  await login(studentEmail, studentPassword, 'student');

  const githubEnv = process.env.GITHUB_ENV;
  if (!githubEnv) {
    throw new Error('GITHUB_ENV is required for CI load-test preparation.');
  }

  const lines = [
    'K6_STUDENT_EMAIL=' + accounts.student.email,
    'K6_STUDENT_PASSWORD=' + accounts.student.password,
    'K6_PARENT_EMAIL=' + accounts.parent.email,
    'K6_PARENT_PASSWORD=' + accounts.parent.password,
    'K6_STAFF_EMAIL=' + accounts.staff.email,
    'K6_STAFF_PASSWORD=' + accounts.staff.password,
    'K6_ADMIN_EMAIL=' + accounts.admin.email,
    'K6_ADMIN_PASSWORD=' + accounts.admin.password,
  ];

  for (const account of Object.values(accounts)) {
    console.log('::add-mask::' + account.email);
    console.log('::add-mask::' + account.password);
  }

  await import('node:fs/promises').then(({ appendFile }) =>
    appendFile(githubEnv, lines.join('\n') + '\n'),
  );

  console.log('Four role identities verified and prepared for the 400-VU test.');
}

await main();
