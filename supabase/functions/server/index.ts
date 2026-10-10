import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'npm:@supabase/supabase-js';

type ManagedRole = 'admin' | 'student' | 'both';
type ManagedUserBody = { id?: string; email?: string; password?: string; full_name?: string; role?: ManagedRole; ti?: string | null };

const app = new Hono();
const apiPrefix = Deno.env.get('QUICKBITE_API_PREFIX') || '/api';

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase server configuration is missing.');
  return createClient(url, key, { auth: { persistSession: false } });
}

function allowedOrigins() {
  return (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function isSetupRequest(c: { req: { header: (name: string) => string | undefined } }) {
  const secret = Deno.env.get('INSTALL_TOKEN');
  return Boolean(secret && c.req.header('x-install-token') === secret);
}

async function requireAdmin(c: { req: { header: (name: string) => string | undefined } }) {
  const token = c.req.header('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  const supabase = serviceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();

  return !profileError && (profile?.role === 'admin' || profile?.role === 'both')
    ? { supabase, userId: data.user.id }
    : null;
}

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizePassword(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRole(value: unknown): ManagedRole | null {
  return value === 'admin' || value === 'student' || value === 'both' ? value : null;
}

function userError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function validateManagedUserInput(body: ManagedUserBody, requirePassword: boolean) {
  const email = normalizeEmail(body.email);
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const role = normalizeRole(body.role);
  const password = normalizePassword(body.password);
  const ti = typeof body.ti === 'string' ? body.ti.trim() : '';

  if (!email || !email.includes('@')) return { error: 'Correo electrónico inválido.' };
  if (!fullName) return { error: 'El nombre completo es obligatorio.' };
  if (!role) return { error: 'Rol inválido.' };
  if (requirePassword && password.length < 6) {
    return { error: 'La contraseña debe tener al menos 6 caracteres.' };
  }
  if (!requirePassword && body.password !== undefined && password && password.length < 6) {
    return { error: 'La nueva contraseña debe tener al menos 6 caracteres.' };
  }
  if (role === 'student' && !ti) {
    return { error: 'La identificación TI es obligatoria para estudiantes.' };
  }

  return { email, fullName, role, password, ti: ti || null };
}

app.use('*', logger(console.log));
app.use('/*', cors({
  origin: (origin) => {
    const allowed = allowedOrigins();
    return !origin || !allowed.length ? null : allowed.includes(origin) ? origin : null;
  },
  allowHeaders: ['Content-Type', 'Authorization', 'apikey', 'x-install-token'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  maxAge: 600,
}));

app.get(`${apiPrefix}/health`, (c) => c.json({ status: 'ok' }));

app.post(`${apiPrefix}/parents/create-from-student`, async (c) => {
  const token = c.req.header('Authorization')?.match(/^Bearer\\s+(.+)$/i)?.[1];
  if (!token) return c.json({ error: 'Sesión de estudiante requerida.' }, 401);
  try {
    const supabase = serviceClient();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return c.json({ error: 'Sesión no válida.' }, 401);
    const { data: student, error: studentError } = await supabase.from('profiles')
      .select('id,role').eq('id', authData.user.id).maybeSingle();
    if (studentError) throw studentError;
    if (!student || !['student','both'].includes(student.role)) return c.json({ error: 'Solo un estudiante puede crear el vínculo familiar.' }, 403);
    const body = await c.req.json() as { email?: string; full_name?: string; relationship?: string };
    const email = normalizeEmail(body.email);
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
    const relationship = typeof body.relationship === 'string' ? body.relationship.trim() : '';
    const allowedRelationships = ['Padre','Madre','Acudiente','Tutor legal','Abuelo/a','Tío/a','Hermano/a','Otro'];
    if (!email || !/^\\S+@\\S+\\.\\S+$/.test(email) || !fullName || !allowedRelationships.includes(relationship)) {
      return c.json({ error: 'Datos del representante incompletos o inválidos.' }, 400);
    }
    const { data: created, error: createError } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, role: 'parent', parent_account_created_automatically: true, initial_parent_password_notice: true },
    });
    if (createError || !created.user) {
      const duplicate = /already|registered|exists/i.test(createError?.message || '');
      return c.json({ error: duplicate
        ? 'El correo del representante ya tiene una cuenta. Debe iniciar sesión y solicitar la vinculación de forma segura.'
        : (createError?.message || 'No se pudo enviar la invitación al representante.') }, duplicate ? 409 : 400);
    }
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: created.user.id, email, full_name: fullName, role: 'parent',
    }, { onConflict: 'id' });
    if (profileError) {
      await supabase.auth.admin.deleteUser(created.user.id);
      return c.json({ error: profileError.message }, 500);
    }
    const { error: linkError } = await supabase.from('parent_student_links').insert({
      parent_user_id: created.user.id, student_user_id: student.id, relationship, active: true,
    });
    if (linkError) {
      await supabase.from('profiles').delete().eq('id', created.user.id);
      await supabase.auth.admin.deleteUser(created.user.id);
      return c.json({ error: 'No se pudo vincular el representante al estudiante: ' + linkError.message }, 500);
    }
    return c.json({ parent: { email, full_name: fullName }, invitation_sent: true, notice_on_first_login: true });
  } catch (error) {
    console.error('Automatic parent account creation failed', error instanceof Error ? error.message : error);
    return c.json({ error: error instanceof Error ? error.message : 'No se pudo crear la cuenta del representante.' }, 500);
  }
});

app.post(`${apiPrefix}/admin/users/create`, async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json({ error: 'No autorizado.' }, 403);

  try {
    const body = await c.req.json() as ManagedUserBody;
    const validated = await validateManagedUserInput(body, true);
    if ('error' in validated) return userError(validated.error);

    if (validated.ti) {
      const { data: tiOwner, error: tiError } = await admin.supabase
        .from('profiles')
        .select('id')
        .eq('ti', validated.ti)
        .maybeSingle();
      if (tiError) throw tiError;
      if (tiOwner) return userError('La identificación TI ya está registrada.');
    }

    const { data, error } = await admin.supabase.auth.admin.createUser({
      email: validated.email,
      password: validated.password,
      email_confirm: true,
      user_metadata: { full_name: validated.fullName, role: validated.role },
    });
    if (error || !data.user) return userError(error?.message || 'No se pudo crear la cuenta.');

    const { error: profileError } = await admin.supabase.from('profiles').upsert({
      id: data.user.id,
      email: validated.email,
      full_name: validated.fullName,
      role: validated.role,
      ti: validated.ti,
    }, { onConflict: 'id' });

    if (profileError) {
      await admin.supabase.auth.admin.deleteUser(data.user.id);
      return userError(profileError.message);
    }

    return c.json({ user: { id: data.user.id, email: validated.email } });
  } catch (error) {
    console.error('Admin user creation failed', error instanceof Error ? error.message : error);
    return userError(error instanceof Error ? error.message : 'No se pudo crear el usuario.', 500);
  }
});

app.post(`${apiPrefix}/admin/users/update`, async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json({ error: 'No autorizado.' }, 403);

  try {
    const body = await c.req.json() as ManagedUserBody;
    if (!body.id) return userError('Falta el identificador del usuario.');

    const validated = await validateManagedUserInput(body, false);
    if ('error' in validated) return userError(validated.error);

    const { data: targetProfile, error: targetError } = await admin.supabase
      .from('profiles')
      .select('id,email,role')
      .eq('id', body.id)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!targetProfile) return userError('Usuario no encontrado.', 404);

    if (body.id === admin.userId && (targetProfile.role === 'admin' || targetProfile.role === 'both') && validated.password) {
      return userError('Otro administrador debe cambiar la contraseña de una cuenta administrativa.');
    }

    if (validated.ti) {
      const { data: tiOwner, error: tiError } = await admin.supabase
        .from('profiles')
        .select('id')
        .eq('ti', validated.ti)
        .neq('id', body.id)
        .maybeSingle();
      if (tiError) throw tiError;
      if (tiOwner) return userError('La identificación TI ya está registrada.');
    }

    const authUpdate: {
      email: string;
      user_metadata: Record<string, string>;
      password?: string;
      email_confirm?: boolean;
    } = {
      email: validated.email,
      email_confirm: true,
      user_metadata: { full_name: validated.fullName, role: validated.role },
    };
    if (validated.password) authUpdate.password = validated.password;

    const { error: authError } = await admin.supabase.auth.admin.updateUserById(body.id, authUpdate);
    if (authError) return userError(authError.message);

    const { error: profileError } = await admin.supabase.from('profiles').upsert({
      id: body.id,
      email: validated.email,
      full_name: validated.fullName,
      role: validated.role,
      ti: validated.ti,
    }, { onConflict: 'id' });
    if (profileError) return userError(profileError.message, 500);

    return c.json({ user: { id: body.id, email: validated.email } });
  } catch (error) {
    console.error('Admin user update failed', error instanceof Error ? error.message : error);
    return userError(error instanceof Error ? error.message : 'No se pudo actualizar el usuario.', 500);
  }
});

app.post(`${apiPrefix}/admin/users/update-protected`, async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json({ error: 'No autorizado.' }, 403);

  try {
    const body = await c.req.json() as ManagedUserBody;
    if (!body.id) return userError('Falta el identificador del usuario.');
    if (!body.email || !normalizeEmail(body.email)) return userError('Correo electrónico inválido.');

    const email = normalizeEmail(body.email);
    const password = normalizePassword(body.password);
    if (body.password !== undefined && password && password.length < 6) {
      return userError('La nueva contraseña debe tener al menos 6 caracteres.');
    }
    if (body.id === admin.userId) {
      return userError('Esta cuenta protegida no puede cambiar sus propias credenciales.');
    }

    const { data: target, error: targetError } = await admin.supabase
      .from('profiles')
      .select('id,email,full_name,role,ti')
      .eq('id', body.id)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) return userError('Cuenta protegida no encontrada.', 404);

    const { data: protectedAccount, error: protectedError } = await admin.supabase
      .rpc('is_protected_admin_email', { p_email: normalizeEmail(target.email) });
    if (protectedError) throw protectedError;
    if (!protectedAccount) return userError('La cuenta indicada no es una cuenta administrativa protegida.', 403);

    const { data: duplicate, error: duplicateError } = await admin.supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .neq('id', body.id)
      .maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) return userError('El correo electrónico ya está registrado.');

    const authUpdate: { email: string; email_confirm?: boolean; password?: string } = {
      email,
      email_confirm: true,
    };
    if (password) authUpdate.password = password;

    const { error: authError } = await admin.supabase.auth.admin.updateUserById(body.id, authUpdate);
    if (authError) return userError(authError.message);

    const { error: profileError } = await admin.supabase.from('profiles').update({ email }).eq('id', body.id);
    if (profileError) return userError(profileError.message, 500);

    if (email !== normalizeEmail(target.email)) {
      const { error: protectedUpdateError } = await admin.supabase
        .from('protected_admins')
        .update({ email })
        .eq('email', normalizeEmail(target.email));
      if (protectedUpdateError) return userError(protectedUpdateError.message, 500);
    }

    return c.json({ user: { id: body.id, email } });
  } catch (error) {
    console.error('Protected admin credential update failed', error instanceof Error ? error.message : error);
    return userError(error instanceof Error ? error.message : 'No se pudieron actualizar las credenciales protegidas.', 500);
  }
});

app.post(`${apiPrefix}/bootstrap-admin`, async (c) => {
  try {
    if (!isSetupRequest(c)) return c.json({ error: 'Unauthorized setup request' }, 401);

    const { email, password, fullName } = await c.req.json();
    if (!email || !password || !fullName) {
      return c.json({ error: 'email, password and fullName are required' }, 400);
    }

    const supabase = serviceClient();
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { full_name: fullName, role: 'admin' },
      email_confirm: true,
    });
    if (error || !data.user) {
      return c.json({ error: error?.message || 'Unable to create user' }, 400);
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      email,
      full_name: fullName,
      role: 'admin',
    });
    if (profileError) return c.json({ error: profileError.message }, 400);

    return c.json({ user: { id: data.user.id, email } });
  } catch {
    return c.json({ error: 'Internal server error during setup' }, 500);
  }
});

Deno.serve(app.fetch);
