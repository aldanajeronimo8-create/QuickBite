import fs from 'node:fs/promises';
import path from 'node:path';

const base = process.env.VITE_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const out = process.env.K6_USERS_FILE || path.join('/tmp', 'quickbite-k6-users.json');
const runId = process.env.GITHUB_RUN_ID || String(Date.now());
const count = 100;
const concurrency = 8;

if (!base || !service) throw new Error('Missing Supabase provisioning credentials.');

const headers = {
  apikey: service,
  Authorization: 'Bearer ' + service,
  'Content-Type': 'application/json',
};

async function api(pathname, options = {}) {
  const response = await fetch(base + pathname, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  if (!response.ok) {
    throw new Error(
      'Supabase ' + (options.method || 'GET') + ' ' + pathname +
      ' failed (' + response.status + '): ' +
      (typeof body === 'string' ? body : JSON.stringify(body)),
    );
  }
  return body;
}

const auth = (pathname, options = {}) => api('/auth/v1' + pathname, options);
const rest = (pathname, options = {}) => api('/rest/v1' + pathname, options);

async function first(pathname) {
  const rows = await rest(pathname);
  if (!Array.isArray(rows) || !rows[0]) throw new Error('No row available for ' + pathname);
  return rows[0];
}

async function listUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const body = await auth('/admin/users?page=' + page + '&per_page=100');
    const rows = Array.isArray(body?.users) ? body.users : [];
    users.push(...rows);
    if (rows.length < 100) return users;
  }
}

async function upsertProfile(account, extra = {}) {
  await rest('/profiles?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      id: account.user_id,
      email: account.email,
      full_name: account.full_name,
      role: account.role,
      active: true,
      ...extra,
    }),
  });
}

async function ensureUser(account, existing) {
  if (existing) {
    return auth('/admin/users/' + encodeURIComponent(existing.id), {
      method: 'PUT',
      body: JSON.stringify({
        password: account.password,
        email_confirm: true,
        user_metadata: {
          role: account.role,
          full_name: account.full_name,
          quickbite_load_test: true,
          run_id: runId,
        },
      }),
    });
  }

  return auth('/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: {
        role: account.role,
        full_name: account.full_name,
        quickbite_load_test: true,
        run_id: runId,
      },
    }),
  });
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  async function workerLoop() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, workerLoop));
}

async function save(state) {
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify(state, null, 2), 'utf8');
}

async function provision() {
  const existing = new Map(
    (await listUsers())
      .filter((u) => u?.email)
      .map((u) => [u.email.toLowerCase(), u]),
  );

  const section = await first('/academic_sections?select=id&active=eq.true&order=display_order.asc&limit=1');
  const grade = await first(
    '/academic_grades?select=id&active=eq.true&section_id=eq.' +
      encodeURIComponent(section.id) +
      '&order=display_order.asc&limit=1',
  );
  const course = await first(
    '/academic_courses?select=id&active=eq.true&grade_id=eq.' +
      encodeURIComponent(grade.id) +
      '&order=display_order.asc&limit=1',
  );

  const state = {
    run_id: runId,
    accounts: { student: [], parent: [], staff: [], admin: [] },
  };
  await save(state);

  const makeSpec = (role, i) => ({
    role,
    index: i + 1,
    email:
      'quickbite-load-' + role + '-' + runId + '-' + String(i + 1).padStart(3, '0') +
      '@example.invalid',
    password: 'QuickBiteLoad-' + runId + '-' + role + '-' + (i + 1) + '!',
    full_name:
      'QuickBite Load ' +
      (role === 'student' ? 'Student ' : role === 'parent' ? 'Parent ' :
        role === 'staff' ? 'Staff ' : 'Admin ') + (i + 1),
  });

  const students = Array.from({ length: count }, (_, i) => makeSpec('student', i));

  await mapLimit(students, concurrency, async (spec) => {
    const user = await ensureUser(spec, existing.get(spec.email));
    await upsertProfile(
      { ...spec, user_id: user.id },
      {
        grade: '11°',
        ti: 'K6STU-' + runId + '-' + String(spec.index).padStart(3, '0'),
        section_id: section.id,
        grade_id: grade.id,
        course_id: course.id,
        student_code: null,
      },
    );
    state.accounts.student.push({
      role: spec.role, index: spec.index, user_id: user.id,
      email: spec.email, password: spec.password,
    });
    await save(state);
  });

  const parents = Array.from({ length: count }, (_, i) => makeSpec('parent', i));
  await mapLimit(parents, concurrency, async (spec) => {
    const student = state.accounts.student[spec.index - 1];
    const user = await ensureUser(spec, existing.get(spec.email));
    await upsertProfile({ ...spec, user_id: user.id });

    await rest('/parent_student_links?on_conflict=parent_user_id,student_user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        parent_user_id: user.id,
        student_user_id: student.user_id,
        relationship: 'Acudiente',
        active: true,
      }),
    });

    await rest('/parent_active_student_context?on_conflict=parent_user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        parent_user_id: user.id,
        student_user_id: student.user_id,
      }),
    });

    state.accounts.parent.push({
      role: spec.role, index: spec.index, user_id: user.id,
      email: spec.email, password: spec.password,
      student_user_id: student.user_id,
    });
    await save(state);
  });

  for (const role of ['staff', 'admin']) {
    const specs = Array.from({ length: count }, (_, i) => makeSpec(role, i));
    await mapLimit(specs, concurrency, async (spec) => {
      const user = await ensureUser(spec, existing.get(spec.email));
      await upsertProfile({ ...spec, user_id: user.id });
      state.accounts[role].push({
        role: spec.role, index: spec.index, user_id: user.id,
        email: spec.email, password: spec.password,
      });
      await save(state);
    });
  }

  const totals = Object.fromEntries(
    Object.entries(state.accounts).map(([role, rows]) => [role, rows.length]),
  );
  const total = Object.values(totals).reduce((sum, n) => sum + n, 0);
  if (total !== 400 || Object.values(totals).some((n) => n !== 100)) {
    throw new Error('Provisioning mismatch: ' + JSON.stringify(totals));
  }

  console.log(JSON.stringify({ event: 'k6_provision_complete', total, per_role: totals }, null, 2));
}

async function deleteByIds(table, column, ids) {
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    if (!chunk.length) continue;
    await rest(
      '/' + table + '?' + column + '=in.(' + chunk.join(',') + ')',
      { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
    );
  }
}

async function cleanup() {
  let state;
  try {
    state = JSON.parse(await fs.readFile(out, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.log('No load-test state file; nothing to clean.');
      return;
    }
    throw error;
  }

  const accounts = Object.values(state.accounts || {}).flat();
  if (!accounts.length) return;

  const ids = accounts.map((a) => a.user_id);
  const studentIds = state.accounts.student.map((a) => a.user_id);
  const parentIds = state.accounts.parent.map((a) => a.user_id);

  await deleteByIds('parent_active_student_context', 'parent_user_id', parentIds);
  await deleteByIds('parent_student_links', 'parent_user_id', parentIds);
  await deleteByIds('family_link_codes', 'student_user_id', studentIds);
  await deleteByIds('profiles', 'id', ids);

  await mapLimit(accounts, concurrency, async (account) => {
    try {
      await auth('/admin/users/' + encodeURIComponent(account.user_id), { method: 'DELETE' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('(404)')) throw error;
    }
  });

  await fs.rm(out, { force: true });
  console.log(JSON.stringify({ event: 'k6_cleanup_complete', removed_accounts: accounts.length }));
}

if ((process.env.K6_ACTION || 'provision') === 'cleanup') {
  await cleanup();
} else {
  await provision();
}
