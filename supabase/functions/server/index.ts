import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'npm:@supabase/supabase-js';

type ExportOrder = { id: string; order_number: string; created_at: string; total: number; status: string; payment_status: string; payment_method: string; pickup_code: string | null; estimated_minutes: number | null; payment_reference: string | null; user: { full_name: string | null; email: string | null; ti: string | null } | null; order_items: Array<{ id: string; product_id: string; quantity: number; price: number; product: { name: string | null; stock: number | null; category: { name: string | null } | null } | null }> };
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
  return !profileError && profile?.role === 'admin' ? { supabase, userId: data.user.id } : null;
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
app.post(`${apiPrefix}/export-google-sheets`, async (c) => {
  const admin = await requireAdmin(c); if (!admin) return c.json({ error: 'Unauthorized' }, 403);
  const url = Deno.env.get('GOOGLE_SHEETS_WEB_APP_URL'); const secret = Deno.env.get('GOOGLE_SHEETS_SHARED_SECRET');
  if (!url || !secret) return c.json({ error: 'Export is not configured' }, 503);
  try {
    const orders = await getActiveOrders(admin.supabase); if (!orders.length) return c.json({ count: 0, batchId: 'empty' });
    const batchId = await batchIdFor(orders);
    const upstream = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-quickbite-secret': secret }, body: JSON.stringify({ ...payloadFor(batchId, orders, admin.userId), secret }) });
    let result: { ok?: boolean; batchId?: string } | null = null; try { result = await upstream.json() as { ok?: boolean; batchId?: string }; } catch { /* invalid response */ }
    if (!upstream.ok || result?.ok !== true || result.batchId !== batchId) { console.error('Google Sheets export rejected', upstream.status); return c.json({ error: 'Google Sheets export failed' }, 502); }
    const { error } = await admin.supabase.from('orders').update({ admin_hidden: true }).in('id', orders.map((order) => order.id)).eq('admin_hidden', false);
    if (error) { console.error('Export succeeded but close failed', error.message); return c.json({ error: 'Sales were exported but could not be closed' }, 500); }
    return c.json({ count: orders.length, batchId });
  } catch (error) { console.error('Google Sheets export failed', error instanceof Error ? error.message : error); return c.json({ error: 'Google Sheets export failed' }, 502); }
});
app.post(`${apiPrefix}/bootstrap-admin`, async (c) => {
  try { if (!isSetupRequest(c)) return c.json({ error: 'Unauthorized setup request' }, 401); const { email, password, fullName } = await c.req.json(); if (!email || !password || !fullName) return c.json({ error: 'email, password and fullName are required' }, 400); const supabase = serviceClient(); const { data, error } = await supabase.auth.admin.createUser({ email, password, user_metadata: { full_name: fullName, role: 'admin' }, email_confirm: true }); if (error || !data.user) return c.json({ error: error?.message || 'Unable to create user' }, 400); const { error: profileError } = await supabase.from('profiles').insert({ id: data.user.id, email, full_name: fullName, role: 'admin' }); if (profileError) return c.json({ error: profileError.message }, 400); return c.json({ user: { id: data.user.id, email } }); } catch { return c.json({ error: 'Internal server error during setup' }, 500); }
});
Deno.serve(app.fetch);