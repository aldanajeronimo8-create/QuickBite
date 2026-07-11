import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'npm:@supabase/supabase-js';

const app = new Hono();
const apiPrefix = Deno.env.get('QUICKBITE_API_PREFIX') || '/api';

function allowedOrigins() {
  return (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isAuthorizedSetupRequest(c: { req: { header: (name: string) => string | undefined } }) {
  const expected = Deno.env.get('INSTALL_TOKEN');
  return Boolean(expected && c.req.header('x-install-token') === expected);
}

app.use('*', logger(console.log));
app.use(
  '/*',
  cors({
    origin: (origin) => {
      const allowed = allowedOrigins();
      if (!origin || allowed.length === 0) return null;
      return allowed.includes(origin) ? origin : null;
    },
    allowHeaders: ['Content-Type', 'Authorization', 'x-install-token'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
  }),
);

app.get(`${apiPrefix}/health`, (c) => c.json({ status: 'ok' }));

app.post(`${apiPrefix}/bootstrap-admin`, async (c) => {
  try {
    if (!isAuthorizedSetupRequest(c)) {
      return c.json({ error: 'Unauthorized setup request' }, 401);
    }

    const { email, password, fullName } = await c.req.json();
    if (!email || !password || !fullName) {
      return c.json({ error: 'email, password and fullName are required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { full_name: fullName, role: 'admin' },
      email_confirm: true,
    });

    if (error || !data.user) {
      console.log('Error creating bootstrap admin:', error);
      return c.json({ error: error?.message || 'Unable to create user' }, 400);
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      email,
      full_name: fullName,
      role: 'admin',
    });

    if (profileError) {
      console.log('Error creating bootstrap profile:', profileError);
      return c.json({ error: profileError.message }, 400);
    }

    return c.json({ user: { id: data.user.id, email } });
  } catch (err) {
    console.log('Unexpected error in bootstrap-admin:', err);
    return c.json({ error: 'Internal server error during setup' }, 500);
  }
});

Deno.serve(app.fetch);
