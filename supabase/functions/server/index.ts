import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'npm:@supabase/supabase-js';

type ExportOrder = { id: string; order_number: string; created_at: string; total: number; status: string; payment_status: string; payment_method: string; pickup_code: string | null; estimated_minutes: number | null; payment_reference: string | null; user: { full_name: string | null; email: string | null; ti: string | null } | null; order_items: Array<{ id: string; product_id: string; quantity: number; price: number; product: { name: string | null; stock: number | null; category: { name: string | null } | null } | null }> };
type ManagedRole = 'admin' | 'student' | 'both';
type ManagedUserBody = { id?: string; email?: string; password?: string; full_name?: string; role?: ManagedRole; ti?: string | null };
const app = new Hono();
const apiPrefix = Deno.env.get('QUICKBITE_API_PREFIX') || '/api';

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase server configuration is missing.');
  return createClient(url, key, { auth: { persistSession: false } });
}
function allowedOrigins() { return (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((value) => value.trim()).filter(Boolean); }
function isSetupRequest(c: { req: { header: (name: string) => string | undefined } }) { const secret = Deno.env.get('INSTALL_TOKEN'); return Boolean(secret && c.req.header('x-install-token') === secret); }
async function requireAdmin(c: { req: { header: (name: string) => string | undefined } }) {
  const token = c.req.header('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]; if (!token) return null;
  const supabase = serviceClient(); const { data, error } = await supabase.auth.getUser(token); if (error || !data.user) return null;
  const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  return !profileError && (profile?.role === 'admin' || profile?.role === 'both')
    ? { supabase, userId: data.user.id } : null;
}
function normalizeEmail(value: unknown) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
function normalizePassword(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function normalizeRole(value: unknown): ManagedRole | null { return value === 'admin' || value === 'student' || value === 'both' ? value : null; }
function userError(message: string, status = 400) { return new Response(JSON.stringify({ error: message }), { status, headers: { 'Content-Type': 'application/json' } }); }

async function validateManagedUserInput(body: ManagedUserBody, requirePassword: boolean) {
  const email = normalizeEmail(body.email);
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const role = normalizeRole(body.role);
  const password = normalizePassword(body.password);
  const ti = typeof body.ti === 'string' ? body.ti.trim() : '';
  if (!email || !email.includes('@')) return { error: 'Correo electrónico inválido.' };
  if (!fullName) return { error: 'El nombre completo es obligatorio.' };
  if (!role) return { error: 'Rol inválido.' };
  if (requirePassword && password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres.' };
  if (!requirePassword && body.password !== undefined && password && password.length < 6) return { error: 'La nueva contraseña debe tener al menos 6 caracteres.' };
  if (role === 'student' && !ti) return { error: 'La identificación TI es obligatoria para estudiantes.' };
  return { email, fullName, role, password, ti: ti || null };
}

async function getActiveOrders(supabase: ReturnType<typeof serviceClient>) {
  const { data, error } = await supabase.from('orders').select('id,order_number,created_at,total,status,payment_status,payment_method,pickup_code,estimated_minutes,payment_reference,user:profiles(full_name,email,ti),order_items(id,product_id,quantity,price,product:products(name,stock,category:categories(name)))').eq('admin_hidden', false).order('created_at', { ascending: true }).limit(10000);
  if (error) throw error; return (data ?? []) as unknown as ExportOrder[];
}
async function batchIdFor(orders: ExportOrder[]) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(orders.map((order) => order.id).join(':')));
  return `quickbite-${Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
function payloadFor(batchId: string, orders: ExportOrder[], closedBy: string) {
  return { batchId, closedAt: new Date().toISOString(), closedBy, orders: orders.map((order) => ({ id: order.id, orderNumber: order.order_number, createdAt: order.created_at, total: order.total, status: order.status, paymentStatus: order.payment_status, paymentMethod: order.payment_method, pickupCode: order.pickup_code, estimatedMinutes: order.estimated_minutes, paymentReference: order.payment_reference, customer: order.user ? { name: order.user.full_name, email: order.user.email, identification: order.user.ti } : null, items: order.order_items.map((item) => ({ id: item.id, productId: item.product_id, product: item.product?.name ?? item.product_id, category: item.product?.category?.name ?? null, quantity: item.quantity, unitPrice: item.price, subtotal: item.price * item.quantity, remainingStock: item.product?.stock ?? null })) })) };
}

app.use('*', logger(console.log));
app.use('/*', cors({ origin: (origin) => { const allowed = allowedOrigins(); return !origin || !allowed.length ? null : allowed.includes(origin) ? origin : null; }, allowHeaders: ['Content-Type', 'Authorization', 'apikey', 'x-install-token'], allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], maxAge: 600 }));
app.get(`${apiPrefix}/health`, (c) => c.json({ status: 'ok' }));

app.post(`${apiPrefix}/admin/users/create`, async (c) => {
  const admin = await requireAdmin(c); if (!admin) return c.json({ error: 'No autorizado.' }, 403);
  try {
    const body = await c.req.json() as ManagedUserBody;
    const validated = await validateManagedUserInput(body, true);
    if ('error' in validated) return userError(validated.error);

    if (validated.ti) {
      const { data: tiOwner, error: tiError } = await admin.supabase.from('profiles').select('id').eq('ti', validated.ti).maybeSingle();
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
  const admin = await requireAdmin(c); if (!admin) return c.json({ error: 'No autorizado.' }, 403);
  try {
    const body = await c.req.json() as ManagedUserBody;
    if (!body.id) return userError('Falta el identificador del usuario.');
    const validated = await validateManagedUserInput(body, false);
    if ('error' in validated) return userError(validated.error);

    const { data: targetProfile, error: targetError } = await admin.supabase.from('profiles').select('id,email,role').eq('id', body.id).maybeSingle();
    if (targetError) throw targetError;
    if (!targetProfile) return userError('Usuario no encontrado.', 404);
    if (body.id === admin.userId && (targetProfile.role === 'admin' || targetProfile.role === 'both') && validated.password) {
      return userError('Otro administrador debe cambiar la contraseña de una cuenta administrativa.');
    }

    if (validated.ti) {
      const { data: tiOwner, error: tiError } = await admin.supabase.from('profiles').select('id').eq('ti', validated.ti).neq('id', body.id).maybeSingle();
      if (tiError) throw tiError;
      if (tiOwner) return userError('La identificación TI ya está registrada.');
    }

    const authUpdate: { email: string; user_metadata: Record<string, string>; password?: string; email_confirm?: boolean } = {
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
  const admin = await requireAdmin(c); if (!admin) return c.json({ error: 'No autorizado.' }, 403);
  try {
    const body = await c.req.json() as ManagedUserBody;
    if (!body.id) return userError('Falta el identificador del usuario.');
    if (!body.email || !normalizeEmail(body.email)) return userError('Correo electrónico inválido.');
    const email = normalizeEmail(body.email);
    const password = normalizePassword(body.password);
    if (body.password !== undefined && password && password.length < 6) return userError('La nueva contraseña debe tener al menos 6 caracteres.');
    if (body.id === admin.userId) return userError('Esta cuenta protegida no puede cambiar sus propias credenciales.');

    const { data: target, error: targetError } = await admin.supabase.from('profiles').select('id,email,full_name,role,ti').eq('id', body.id).maybeSingle();
    if (targetError) throw targetError;
    if (!target) return userError('Cuenta protegida no encontrada.', 404);

    const { data: protectedAccount, error: protectedError } = await admin.supabase.rpc('is_protected_admin_email', { p_email: normalizeEmail(target.email) });
    if (protectedError) throw protectedError;
    if (!protectedAccount) return userError('La cuenta indicada no es una cuenta administrativa protegida.', 403);

    const { data: duplicate, error: duplicateError } = await admin.supabase.from('profiles').select('id').eq('email', email).neq('id', body.id).maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) return userError('El correo electrónico ya está registrado.');

    const authUpdate: { email: string; email_confirm?: boolean; password?: string } = { email, email_confirm: true };
    if (password) authUpdate.password = password;
    const { error: authError } = await admin.supabase.auth.admin.updateUserById(body.id, authUpdate);
    if (authError) return userError(authError.message);

    const { error: profileError } = await admin.supabase.from('profiles').update({ email }).eq('id', body.id);
    if (profileError) return userError(profileError.message, 500);

    if (email !== normalizeEmail(target.email)) {
      const { error: protectedUpdateError } = await admin.supabase.from('protected_admins').update({ email }).eq('email', normalizeEmail(target.email));
      if (protectedUpdateError) return userError(protectedUpdateError.message, 500);
    }

    return c.json({ user: { id: body.id, email } });
  } catch (error) {
    console.error('Protected admin credential update failed', error instanceof Error ? error.message : error);
    return userError(error instanceof Error ? error.message : 'No se pudieron actualizar las credenciales protegidas.', 500);
  }
});

app.post(`${apiPrefix}/export-google-sheets`, async (c) => {
  const admin = await requireAdmin(c); if (!admin) return c.json({ error: 'Unauthorized' }, 403);
  const url = Deno.env.get('GOOGLE_SHEETS_WEB_APP_URL'); const secret = Deno.env.get('GOOGLE_SHEETS_SHARED_SECRET');
  if (!url || !secret) return c.json({ error: 'Export is not configured' }, 503);
  try {
    const orders = await getActiveOrders(admin.supabase); if (!orders.length) return c.json({ count: 0, batchId: 'empty' });
    const batchId = await batchIdFor(orders);
    const upstream = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-quickbite-secret': secret }, body: JSON.stringify({ ...payloadFor(batchId, orders, admin.userId), secret }) });
    let result: { ok?: boolean; batchId?: string; exportId?: string; exportedCount?: number; total?: number } | null = null; try { result = await upstream.json() as { ok?: boolean; batchId?: string; exportId?: string; exportedCount?: number; total?: number }; } catch { /* invalid response */ }
    if (!upstream.ok || result?.ok !== true || result.batchId !== batchId) { console.error('Google Sheets export rejected', upstream.status); return c.json({ error: 'Google Sheets export failed' }, 502); }
    const { error } = await admin.supabase.from('orders').update({ admin_hidden: true }).in('id', orders.map((order) => order.id)).eq('admin_hidden', false);
    if (error) { console.error('Export succeeded but close failed', error.message); return c.json({ error: 'Sales were exported but could not be closed' }, 500); }
    return c.json({ count: orders.length, batchId, exportId: result.exportId ?? batchId, exportedCount: result.exportedCount ?? orders.length, total: result.total ?? orders.length });
  } catch (error) { console.error('Google Sheets export failed', error instanceof Error ? error.message : error); return c.json({ error: 'Google Sheets export failed' }, 502); }
});

app.post(`${apiPrefix}/bootstrap-admin`, async (c) => {
  try { if (!isSetupRequest(c)) return c.json({ error: 'Unauthorized setup request' }, 401); const { email, password, fullName } = await c.req.json(); if (!email || !password || !fullName) return c.json({ error: 'email, password and fullName are required' }, 400); const supabase = serviceClient(); const { data, error } = await supabase.auth.admin.createUser({ email, password, user_metadata: { full_name: fullName, role: 'admin' }, email_confirm: true }); if (error || !data.user) return c.json({ error: error?.message || 'Unable to create user' }, 400); const { error: profileError } = await supabase.from('profiles').insert({ id: data.user.id, email, full_name: fullName, role: 'admin' }); if (profileError) return c.json({ error: profileError.message }, 400); return c.json({ user: { id: data.user.id, email } }); } catch { return c.json({ error: 'Internal server error during setup' }, 500); }
});

Deno.serve(app.fetch);
