import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'npm:@supabase/supabase-js';

type ManagedRole = 'admin' | 'student' | 'both' | 'all';
type ManagedUserBody = { id?: string; email?: string; password?: string; full_name?: string; role?: ManagedRole; ti?: string | null };

const app = new Hono();
const apiPrefix = Deno.env.get('QUICKBITE_API_PREFIX') || '/api';

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase server configuration is missing.');
  return createClient(url, key, { auth: { persistSession: false } });
}

// Use the authenticated administrator's JWT for database authorization markers.
// Modern Supabase secret API keys are gateway credentials, not JWTs carrying
// the service_role claim; SQL must authorize the real actor, not infer identity
// from the server API key.
function authenticatedActorClient(token: string) {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (!url || !key) throw new Error('Supabase authenticated client configuration is missing.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function allowedOrigins() {
  const configured = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const defaults = [
    'https://quick-bite-snowy-ten.vercel.app',
    'https://quick-bite-quick-bite5.vercel.app',
    'https://quick-bite-git-main-quick-bite5.vercel.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ];
  return [...new Set([...defaults, ...configured])];
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
  // No privileged API is available while a protected account still has its temporary password.
  if (data.user.app_metadata?.quickbite_must_change_password === true) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();

  return !profileError && (profile?.role === 'admin' || profile?.role === 'both' || profile?.role === 'all')
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
  return value === 'admin' || value === 'student' || value === 'both' || value === 'all' ? value : null;
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
  if (role === 'all') return { error: 'El rol all solo puede asignarse mediante el aprovisionamiento protegido.' };
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
  allowHeaders: ['Content-Type', 'Authorization', 'apikey', 'x-client-info', 'x-install-token'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  maxAge: 600,
}));

app.get(`${apiPrefix}/health`, (c) => c.json({ status: 'ok' }));

app.post(`${apiPrefix}/parents/create-from-student`, async (c) => {
  const token = c.req.header('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return c.json({ error: 'Sesión de estudiante requerida.' }, 401);
  try {
    const supabase = serviceClient();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return c.json({ error: 'Sesión no válida.' }, 401);
    const { data: student, error: studentError } = await supabase.from('profiles')
      .select('id,role').eq('id', authData.user.id).maybeSingle();
    if (studentError) throw studentError;
    if (!student || !['student','both','all'].includes(student.role)) return c.json({ error: 'Solo un estudiante puede crear el vínculo familiar.' }, 403);

    const body = await c.req.json() as { email?: string; full_name?: string; relationship?: string; cedula?: string };
    const email = normalizeEmail(body.email);
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
    const relationship = typeof body.relationship === 'string' ? body.relationship.trim() : '';
    const cedula = typeof body.cedula === 'string' ? body.cedula.replace(/\D/g, '') : '';
    const allowedRelationships = ['Padre','Madre','Acudiente','Tutor legal','Abuelo/a','Tío/a','Hermano/a','Otro'];
    if (!email || !/^\S+@\S+\.\S+$/.test(email) || !fullName || !allowedRelationships.includes(relationship) || !/^\d{6,12}$/.test(cedula)) {
      return c.json({ error: 'Correo, nombre, parentesco o cédula del representante inválidos. La cédula debe tener de 6 a 12 dígitos.' }, 400);
    }

    // La cuenta se crea inmediatamente. La cédula solo es la contraseña inicial y no se registra en logs.
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: cedula,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'parent',
        parent_account_created_automatically: true,
        initial_parent_password_notice: true,
      },
    });
    if (createError || !created.user) {
      const duplicate = /already|registered|exists|duplicate/i.test(createError?.message || '');
      return c.json({ error: duplicate
        ? 'Ese correo ya tiene una cuenta. No se modificó su contraseña ni se vinculó automáticamente; usa una cuenta de representante distinta o solicita la vinculación de una cuenta existente.'
        : (createError?.message || 'No se pudo crear la cuenta del representante.') }, duplicate ? 409 : 400);
    }

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: created.user.id, email, full_name: fullName, role: 'parent',
    }, { onConflict: 'id' });
    if (profileError) {
      await supabase.auth.admin.deleteUser(created.user.id);
      return c.json({ error: 'La cuenta no pudo completar su perfil: ' + profileError.message }, 500);
    }

    const { error: linkError } = await supabase.from('parent_student_links').insert({
      parent_user_id: created.user.id, student_user_id: student.id, relationship, active: true,
    });
    if (linkError) {
      await supabase.from('profiles').delete().eq('id', created.user.id);
      await supabase.auth.admin.deleteUser(created.user.id);
      return c.json({ error: 'No se pudo vincular el representante al estudiante: ' + linkError.message }, 500);
    }
    return c.json({
      parent: { email, full_name: fullName },
      account_created: true,
      invitation_sent: false,
      notice_on_first_login: true,
    });
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
    if (!password || password.length < 6) {
      return userError('Introduce una nueva contraseña de al menos 6 caracteres.');
    }
    if (body.id === admin.userId) {
      return userError('Esta cuenta protegida no puede cambiar sus propias credenciales.');
    }

    const { data: target, error: targetError } = await admin.supabase
      .from('profiles')
      .select('id,email,role')
      .eq('id', body.id)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) return userError('Cuenta protegida no encontrada.', 404);

    const originalEmail = normalizeEmail(target.email);
    if (email !== originalEmail) {
      return userError('El correo de esta cuenta protegida no se puede cambiar desde este formulario.', 400);
    }

    const { data: protectedAccount, error: protectedError } = await admin.supabase
      .rpc('is_protected_admin_email', { p_email: originalEmail });
    if (protectedError) throw protectedError;
    if (!protectedAccount || target.role !== 'all') {
      return userError('La cuenta indicada no es una cuenta administrativa protegida.', 403);
    }

    // The marker RPC must receive the authenticated admin JWT. The service
    // API key authenticates the Edge Function's privileged Auth write, but is
    // not a reliable auth.role() identity for PostgREST with modern sb_secret keys.
    const actorToken = c.req.header('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!actorToken) return userError('Tu sesión administrativa expiró. Inicia sesión nuevamente.', 401);
    const actorClient = authenticatedActorClient(actorToken);

    // Create a short-lived, one-use database marker before the Auth password write.
    // The SECURITY DEFINER RPC independently checks this actor is an active admin
    // and that the target is an allowlisted protected role=all account.
    const { error: beginError } = await actorClient.rpc(
      'begin_protected_admin_credential_password_change',
      { p_user_id: body.id },
    );
    if (beginError) {
      console.error('Protected credential password-change marker failed', beginError.code || 'database_error');
      return userError('No se pudo autorizar el cambio de contraseña protegida.', 409);
    }

    const { error: authError } = await admin.supabase.auth.admin.updateUserById(body.id, { password });
    if (authError) {
      console.error('Protected credential password update failed', authError.code || 'auth_error');
      return userError('Supabase no pudo guardar la nueva contraseña. La cuenta no fue modificada por este paso.', 400);
    }

    const { error: finishError } = await actorClient.rpc(
      'finish_protected_admin_credential_password_change',
      { p_user_id: body.id },
    );
    if (finishError) {
      console.error('Protected credential password-change finalization failed', finishError.code || 'database_error');
      return userError('La contraseña se guardó, pero falta verificar el cierre seguro. Vuelve a guardar la misma contraseña para completar la verificación.', 500);
    }

    return c.json({ user: { id: body.id, email: originalEmail }, password_changed: true });
  } catch (error) {
    console.error('Protected admin credential update failed', error instanceof Error ? error.message : error);
    return userError(error instanceof Error ? error.message : 'No se pudieron actualizar las credenciales protegidas.', 500);
  }
});


/**
 * Changes a protected account's temporary password exactly once.
 * Password and app_metadata updates are separate Auth database operations, so
 * a service-only, expiring marker authorizes the two exact phases in the DB trigger.
 */
app.post(apiPrefix + '/protected-first-access/change-password', async (c) => {
  try {
    const token = c.req.header('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return c.json({ error: 'Inicia sesión con la cuenta protegida para continuar.' }, 401);

    const supabase = serviceClient();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return c.json({ error: 'La sesión no es válida. Inicia sesión de nuevo.' }, 401);

    const email = normalizeEmail(authData.user.email);
    const allowedAccounts = [
      'aldana.jeronimo@maximino.edu.co',
      'colmenares.juan@maximino.edu.co',
      'useche.diego@maximino.edu.co',
      'fernandez.gabriel@maximino.edu.co',
    ];
    if (!allowedAccounts.includes(email)) return c.json({ error: 'Esta ruta es exclusiva para las cuentas protegidas.' }, 403);

    const metadata = authData.user.app_metadata || {};
    if (metadata.quickbite_protected_account !== true || metadata.quickbite_must_change_password !== true) {
      return c.json({ error: 'Esta cuenta no tiene pendiente el cambio inicial de contraseña.' }, 409);
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id,email,role')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || normalizeEmail(profile.email) !== email || profile.role !== 'all') {
      return c.json({ error: 'La identidad no está vinculada al perfil protegido con rol all.' }, 403);
    }

    const { data: protectedAccount, error: protectionError } = await supabase
      .rpc('is_protected_admin_email', { p_email: email });
    if (protectionError) throw protectionError;
    if (protectedAccount !== true) return c.json({ error: 'La cuenta no figura en la lista protegida.' }, 403);

    const body = await c.req.json() as { new_password?: string };
    const newPassword = typeof body.new_password === 'string' ? body.new_password : '';
    if (newPassword.length < 12 || newPassword.length > 128
      || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword)
      || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      return c.json({ error: 'La contraseña debe tener entre 12 y 128 caracteres e incluir mayúsculas, minúsculas, números y un símbolo.' }, 400);
    }

    // If phase 1 succeeded but metadata finalization failed previously, recover
    // that exact pending transition without rotating the already-saved password again.
    const { data: previousAttempt, error: attemptLookupError } = await supabase
      .from('protected_first_access_attempts')
      .select('password_changed_at, expires_at')
      .eq('user_id', authData.user.id)
      .maybeSingle();
    if (attemptLookupError) {
      console.error('Protected first-access marker lookup failed', attemptLookupError.code || 'database_error');
      return c.json({ error: 'No se pudo comprobar el estado del cambio seguro de contraseña.' }, 500);
    }

    const passwordPhaseAlreadyCompleted = Boolean(
      previousAttempt?.password_changed_at
      && previousAttempt.expires_at
      && Date.parse(previousAttempt.expires_at) > Date.now(),
    );

    if (!passwordPhaseAlreadyCompleted) {
      // Arm a fresh, expiring marker before changing the password hash.
      const { error: beginError } = await supabase.rpc(
        'begin_protected_first_access_password_change',
        { p_user_id: authData.user.id },
      );
      if (beginError) {
        console.error('Protected first-access marker could not be created', beginError.code || 'database_error');
        return c.json({ error: 'No se pudo iniciar el cambio seguro de contraseña.' }, 500);
      }

      // Phase 1: Auth updates the password and its ancillary tokens.
      const { error: passwordError } = await supabase.auth.admin.updateUserById(authData.user.id, {
        password: newPassword,
      });
      if (passwordError) {
        console.error('Protected first-access password update failed', passwordError.code || 'auth_error');
        return c.json({ error: 'No se pudo guardar la nueva contraseña. Inténtalo de nuevo.' }, 400);
      }
    }

    // Phase 2: finish through a service-only DB RPC that validates the one-time
    // marker and account identity, then performs the narrow metadata transition.
    const { error: metadataUpdateError } = await supabase.rpc(
      'complete_protected_first_access_password_change',
      { p_user_id: authData.user.id },
    );
    if (metadataUpdateError) {
      console.error('Protected first-access metadata finalization failed', metadataUpdateError.code || 'database_error');
      return c.json({
        error: 'No se pudo finalizar la activación de la cuenta.',
        code: 'protected_password_metadata_finalize_failed',
      }, 500);
    }

    const { data: verified, error: verifyError } = await supabase.auth.admin.getUserById(authData.user.id);
    if (verifyError || verified.user?.app_metadata?.quickbite_must_change_password !== false
      || verified.user?.app_metadata?.quickbite_protected_account !== true) {
      console.error('Protected first-access final state verification failed', verifyError?.code || 'metadata_state_mismatch');
      return c.json({ error: 'No se pudo verificar la activación de la cuenta.' }, 500);
    }

    return c.json({ changed: true, sign_in_again_required: true });
  } catch (error) {
    console.error('Protected first-access password change failed', error instanceof Error ? error.message : 'unknown error');
    return c.json({ error: 'No se pudo completar la activación segura de la cuenta.' }, 500);
  }
});

app.get(apiPrefix + '/bootstrap-protected-accounts-setup', (c) => {
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>QuickBite · Aprovisionamiento protegido</title>
  <style>
    :root{color-scheme:dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#10141c;color:#edf2f7}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}
    main{width:min(100%,620px);border:1px solid #303a49;border-radius:18px;padding:28px;background:#171e29;box-shadow:0 20px 65px #0005}
    h1{font-size:1.45rem;margin:0 0 8px}p{line-height:1.55;color:#b9c4d3}
    label{display:block;font-weight:650;margin:22px 0 8px}
    input{width:100%;padding:13px;border-radius:10px;border:1px solid #46566b;background:#0c1118;color:#fff;font:inherit}
    button{margin-top:16px;width:100%;padding:13px;border:0;border-radius:10px;background:#9ee6c0;color:#10251a;font-weight:750;font:inherit;cursor:pointer}
    button:disabled{opacity:.55;cursor:wait}#status{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:18px;color:#ffd68a}
    pre{display:none;white-space:pre-wrap;overflow-wrap:anywhere;background:#0b1017;padding:16px;border-radius:10px;border:1px solid #303a49;color:#e2f8e9;max-height:55vh;overflow:auto}
    .notice{font-size:.92rem;border-left:3px solid #d4aa58;padding-left:12px}
  </style>
</head>
<body>
<main>
  <h1>QuickBite · Configuración inicial protegida</h1>
  <p>Esta pantalla puede crear únicamente las cuatro cuentas escolares autorizadas. Revisa el resultado antes de cerrar la página.</p>
  <p class="notice">Introduce el valor actual de INSTALL_TOKEN. No lo compartas por chat. Se envía solo en una cabecera HTTPS y no se escribe en la URL. Las contraseñas provisionales aparecerán únicamente si el servidor crea una cuenta nueva.</p>
  <form id="setupForm" autocomplete="off">
    <label for="setupToken">INSTALL_TOKEN</label>
    <input id="setupToken" name="setupToken" type="password" required autocomplete="new-password" spellcheck="false">
    <button id="submitBtn" type="submit">Verificar y aprovisionar las cuatro cuentas</button>
  </form>
  <div id="status" role="status" aria-live="polite"></div>
  <pre id="result" aria-label="Resultado del aprovisionamiento"></pre>
  <p class="notice">Guarda las contraseñas provisionales de forma segura. Cada una dejará de funcionar cuando su titular complete el cambio obligatorio de primer acceso.</p>
</main>
<script>
(() => {
  const form = document.getElementById('setupForm');
  const tokenInput = document.getElementById('setupToken');
  const submitButton = document.getElementById('submitBtn');
  const status = document.getElementById('status');
  const result = document.getElementById('result');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const token = tokenInput.value;
    if (!token) return;
    tokenInput.value = '';
    submitButton.disabled = true;
    status.textContent = 'Validando token y comprobando identidades existentes…';
    result.style.display = 'none';
    result.textContent = '';
    try {
      const endpoint = window.location.pathname.replace(/\\/bootstrap-protected-accounts-setup$/, '/bootstrap-protected-accounts');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-install-token': token },
        body: '{}',
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer'
      });
      const bodyText = await response.text();
      let data;
      try { data = JSON.parse(bodyText); } catch { data = { error: 'El servidor respondió con un formato no esperado.', status: response.status }; }
      status.textContent = response.ok
        ? 'Solicitud terminada. Revisa los estados de las cuatro cuentas y guarda de forma segura las contraseñas que se hayan creado.'
        : 'La solicitud no se completó. Revisa el mensaje antes de volver a intentarlo.';
      result.textContent = JSON.stringify(data, null, 2);
      result.style.display = 'block';
    } catch (_) {
      status.textContent = 'No se pudo contactar al servidor. No se muestran contraseñas; inténtalo otra vez cuando la conexión esté disponible.';
    } finally {
      tokenInput.value = '';
      submitButton.disabled = false;
    }
  });
})();
</script>
</body>
</html>`;
  return c.html(html, 200, {
    'Content-Type': 'text/html; charset=UTF-8',
    'Cache-Control': 'no-store, max-age=0',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
});

/**
 * Safe, one-time provisioning for exactly the four protected accounts.
 * It never changes credentials for an existing Auth identity or profile.
 * Each newly created account receives a different high-entropy temporary
 * password, returned once only to the caller holding INSTALL_TOKEN.
 */
app.post(apiPrefix + '/bootstrap-protected-accounts', async (c) => {
  try {
    if (!isSetupRequest(c)) return c.json({ error: 'Unauthorized setup request' }, 401);

    const accounts = [
      { email: 'aldana.jeronimo@maximino.edu.co', fullName: 'Jeronimo Aldana Bonilla' },
      { email: 'colmenares.juan@maximino.edu.co', fullName: 'Juan Felipe Colmenares' },
      { email: 'useche.diego@maximino.edu.co', fullName: 'Diego Useche' },
      { email: 'fernandez.gabriel@maximino.edu.co', fullName: 'Gabriel Fernandez' },
    ] as const;

    const supabase = serviceClient();
    const results: Array<{ email: string; status: 'created' | 'already_ready' | 'conflict' | 'failed'; detail?: string; temporary_password?: string }> = [];

    for (const account of accounts) {
      let newlyCreatedUserId: string | null = null;
      try {
        const { data: isProtected, error: protectionError } = await supabase
          .rpc('is_protected_admin_email', { p_email: account.email });
        if (protectionError) throw protectionError;
        if (isProtected !== true) {
          results.push({ email: account.email, status: 'conflict', detail: 'El correo no está en la lista protegida de producción.' });
          continue;
        }

        const { data: existingProfile, error: profileLookupError } = await supabase
          .from('profiles')
          .select('id,email,full_name,role')
          .eq('email', account.email)
          .maybeSingle();
        if (profileLookupError) throw profileLookupError;

        let existingAuthUser: { id: string; email?: string } | null = null;
        for (let page = 1; page <= 20; page += 1) {
          const { data: users, error: listError } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
          if (listError) throw listError;
          const found = users.users.find((user) => normalizeEmail(user.email) === account.email);
          if (found) {
            existingAuthUser = { id: found.id, email: found.email };
            break;
          }
          if (users.users.length < 1000) break;
        }

        if (existingAuthUser || existingProfile) {
          if (existingAuthUser && existingProfile && existingAuthUser.id === existingProfile.id && existingProfile.role === 'all') {
            const { data: metadataUser, error: metadataError } = await supabase.auth.admin.getUserById(existingAuthUser.id);
            if (metadataError) throw metadataError;
            if (metadataUser.user?.app_metadata?.quickbite_protected_account === true
              && metadataUser.user?.app_metadata?.quickbite_must_change_password === false) {
              results.push({ email: account.email, status: 'already_ready', detail: 'La identidad existente está activada; no se cambiaron contraseña ni sesión.' });
              continue;
            }
          }
          results.push({
            email: account.email,
            status: 'conflict',
            detail: 'Ya existe una identidad o perfil parcial; no se modificó ni recreó.',
          });
          continue;
        }

        const temporaryPassword = 'Qb!7-' + crypto.randomUUID() + '-xR2';
        const { data: created, error: createError } = await supabase.auth.admin.createUser({
          email: account.email,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: { full_name: account.fullName, role: 'all' },
          app_metadata: {
            quickbite_protected_account: true,
            quickbite_must_change_password: true,
          },
        });
        if (createError || !created.user) {
          results.push({ email: account.email, status: 'failed', detail: createError?.message || 'No se pudo crear la identidad.' });
          continue;
        }
        newlyCreatedUserId = created.user.id;

        const { error: profileError } = await supabase.from('profiles').insert({
          id: created.user.id,
          email: account.email,
          full_name: account.fullName,
          role: 'all',
        });
        if (profileError) {
          await supabase.auth.admin.deleteUser(created.user.id);
          newlyCreatedUserId = null;
          results.push({ email: account.email, status: 'failed', detail: 'No se pudo crear el perfil; la identidad recién creada se revirtió.' });
          continue;
        }

        results.push({ email: account.email, status: 'created', temporary_password: temporaryPassword });
        newlyCreatedUserId = null;
      } catch (error) {
        if (newlyCreatedUserId) {
          try { await supabase.auth.admin.deleteUser(newlyCreatedUserId); } catch { /* leave reconciliation to the audit */ }
        }
        results.push({
          email: account.email,
          status: 'failed',
          detail: error instanceof Error ? error.message : 'Error al provisionar la cuenta.',
        });
      }
    }

    const complete = results.every((result) => result.status === 'created' || result.status === 'already_ready');
    return c.json({ complete, role: 'all', first_access_password_change_required: true, results }, complete ? 200 : 207);
  } catch {
    return c.json({ error: 'No se pudo completar el bootstrap de cuentas protegidas.' }, 500);
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

// Gateways may provide either the function-relative path or the full gateway path.
Deno.serve((request: Request) => {
  const url = new URL(request.url);
  const functionPrefixes = ['/functions/v1/server', '/server'];
  const functionPrefix = functionPrefixes.find(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  );
  if (functionPrefix) {
    url.pathname = url.pathname.slice(functionPrefix.length) || '/';
  }
  return app.fetch(new Request(url, request));
});
