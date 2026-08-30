import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.PLAYWRIGHT_E2E_EMAIL?.trim().toLowerCase();
const password = process.env.PLAYWRIGHT_E2E_PASSWORD;

if (!url || !serviceRoleKey || !email || !password) {
  throw new Error('E2E Supabase configuration is incomplete.');
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let user = null;
let page = 1;
while (!user) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw error;
  user = data.users.find((candidate) => candidate.email?.toLowerCase() === email) ?? null;
  if (data.users.length < 100) break;
  page += 1;
}

if (user) {
  const { data, error } = await admin.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    user_metadata: {
      ...(user.user_metadata ?? {}),
      role: 'student',
      full_name: 'QuickBite E2E Student',
    },
  });
  if (error) throw error;
  user = data.user;
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'student', full_name: 'QuickBite E2E Student' },
  });
  if (error) throw error;
  user = data.user;
}

const { error: profileError } = await admin.from('profiles').upsert(
  {
    id: user.id,
    email,
    full_name: 'QuickBite E2E Student',
    role: 'student',
  },
  { onConflict: 'id' },
);
if (profileError) throw profileError;

const publicClient = createClient(url, process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: sessionData, error: signInError } = await publicClient.auth.signInWithPassword({
  email,
  password,
});
if (signInError || !sessionData.user) {
  throw signInError ?? new Error('E2E user could not sign in after provisioning.');
}

console.log(`E2E user ready: ${email}`);
