import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const protectedAdmins = [
  ['colmenares.juan@maximino.edu.co', 'Juan Colmenares'],
  ['aldana.jeronimo@maximino.edu.co', 'Jeronimo Aldana'],
  ['jeronimoaldana901@gmail.com', 'Jeronimo Aldana 901'],
  ['fernandez.gabriel@maximino.edu.co', 'Gabriel Fernandez'],
  ['useche.diego@maximino.edu.co', 'Diego Useche'],
];

const deprecatedProtectedEmails = ['useche.iego@maximino.edu.co'];

function readEnv() {
  const envPath = path.join(process.cwd(), '.env');
  const values = {};
  if (!fs.existsSync(envPath)) return values;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    values[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return values;
}

const env = readEnv();
const dbUrl = process.env.SUPABASE_DB_URL || env.SUPABASE_DB_URL;
const password = process.env.PROTECTED_ADMIN_PASSWORD;

if (!dbUrl) throw new Error('SUPABASE_DB_URL is required.');
if (!password)
  throw new Error(
    'PROTECTED_ADMIN_PASSWORD is required and must be supplied only as an environment variable.',
  );

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.allow_protected_admin_maintenance', 'true', true)");

  for (const email of deprecatedProtectedEmails) {
    await client.query('DELETE FROM auth.users WHERE email = $1', [email]);
  }

  for (const [email, fullName] of protectedAdmins) {
    const existing = await client.query('SELECT id FROM auth.users WHERE email = $1', [email]);
    let userId;

    if (existing.rowCount) {
      userId = existing.rows[0].id;
      await client.query(
        `
          UPDATE auth.users
          SET encrypted_password = extensions.crypt($2::text, extensions.gen_salt('bf')),
              email_confirmed_at = NOW(),
              banned_until = NULL,
              raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
                || jsonb_build_object('full_name', $3::text, 'role', 'admin'),
              updated_at = NOW()
          WHERE id = $1
        `,
        [userId, password, fullName],
      );
    } else {
      const created = await client.query(
        `
        INSERT INTO auth.users (
          instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          banned_until, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        )
        VALUES (
          '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          $1::text, extensions.crypt($2::text, extensions.gen_salt('bf')), NOW(), NULL,
          jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
          jsonb_build_object('full_name', $3::text, 'role', 'admin'), NOW(), NOW()
        )
        RETURNING id
      `,
        [email, password, fullName],
      );
      userId = created.rows[0].id;
    }

    await client.query("DELETE FROM auth.identities WHERE user_id = $1 AND provider = 'email'", [
      userId,
    ]);

    await client.query(
      `
        INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        VALUES ($1::text, $2::uuid, jsonb_build_object('sub', $2::text, 'email', $1::text, 'email_verified', true, 'phone_verified', false), 'email', NOW(), NOW(), NOW())
      `,
      [email, userId],
    );

    await client.query(
      `
        INSERT INTO public.profiles (id, email, full_name, role)
        VALUES ($1, $2, $3, 'admin')
        ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, role = 'admin', updated_at = NOW()
      `,
      [userId, email, fullName],
    );
  }

  await client.query('COMMIT');
  console.log(`Protected administrators provisioned: ${protectedAdmins.length}`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
