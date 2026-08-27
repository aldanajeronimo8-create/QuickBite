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

app.post(`${apiPrefix}/export-google-sheets`, async (c) => {
  const sheetsUrl = Deno.env.get('GOOGLE_SHEETS_WEB_APP_URL');
  const sheetsSecret = Deno.env.get('GOOGLE_SHEETS_SHARED_SECRET');
  if (!sheetsUrl || !sheetsSecret) {
    return c.json({ error: 'Google Sheets no está configurado en el servidor.' }, 503);
  }

  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'No autorizado.' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: identity, error: identityError } = await supabase.auth.getUser(token);
  if (identityError || !identity.user) return c.json({ error: 'Sesión no válida.' }, 401);

  const { data: administrator, error: adminError } = await supabase
    .from('profiles')
    .select('id,full_name,role')
    .eq('id', identity.user.id)
    .single();
  if (adminError || !administrator || !['admin', 'both'].includes(administrator.role)) {
    return c.json({ error: 'Solo administradores pueden exportar ventas.' }, 403);
  }

  try {
    let { data: batch } = await supabase
      .from('sales_export_batches')
      .select('*')
      .eq('status', 'pending')
      .maybeSingle();

    let orders: any[] = [];
    if (batch) {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*, product:products(*, category:categories(*))), user:profiles(*)')
        .in('id', batch.order_ids as string[])
        .is('exported_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      orders = data ?? [];
    } else {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*, product:products(*, category:categories(*))), user:profiles(*)')
        .is('exported_at', null)
        .order('created_at', { ascending: true })
        .limit(10000);
      if (error) throw error;
      orders = data ?? [];
      const exportId = crypto.randomUUID();
      const total = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
      const { data: created, error: createError } = await supabase
        .from('sales_export_batches')
        .insert({ id: exportId, order_ids: orders.map((order) => order.id), created_by: administrator.id, exported_count: orders.length, total })
        .select('*')
        .single();
      if (createError) throw createError;
      batch = created;
    }

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*, category:categories(*)')
      .order('name');
    if (productsError) throw productsError;

    const now = new Date();
    const exportId = batch.id as string;
    const total = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const sales = orders.flatMap((order) => (order.order_items ?? []).map((item: any) => [
      order.id, now.toISOString().slice(0, 10), now.toTimeString().slice(0, 8), order.created_at,
      order.user_id, order.user?.full_name ?? '', order.user?.ti ?? '', item.product?.name ?? item.product_id,
      item.product?.category?.name ?? '', item.quantity, Number(item.price || 0), Number(item.price || 0) * item.quantity,
      0, Number(order.total || 0), order.payment_method, order.payment_status, order.status,
      administrator.full_name, order.pickup_code ?? order.order_number, order.payment_reference ?? '', item.stock_before ?? '', item.stock_after ?? '',
    ]));
    const inventory = (products ?? []).map((product: any) => {
      const unitsSold = orders.flatMap((order) => order.order_items ?? []).filter((item: any) => item.product_id === product.id).reduce((sum: number, item: any) => sum + item.quantity, 0);
      return [product.id, product.name, product.category?.name ?? '', Number(product.price || 0), '', unitsSold, product.stock, now.toISOString(), product.available ? 'activo' : 'oculto', product.stock > 0 && product.available ? 'disponible' : 'agotado'];
    });
    const byProduct = new Map<string, number>();
    const byMethod = new Map<string, number>();
    orders.forEach((order) => {
      byMethod.set(order.payment_method, (byMethod.get(order.payment_method) ?? 0) + 1);
      (order.order_items ?? []).forEach((item: any) => byProduct.set(item.product?.name ?? item.product_id, (byProduct.get(item.product?.name ?? item.product_id) ?? 0) + item.quantity));
    });
    const mostSold = [...byProduct.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Sin ventas';
    const mostUsedMethod = [...byMethod.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Sin pagos';
    const summary = [
      ['Ventas exportadas', orders.length], ['Total de ingresos', total], ['Productos vendidos', sales.reduce((sum: number, row: any[]) => sum + Number(row[9]), 0)],
      ['Producto más vendido', mostSold], ['Método de pago más utilizado', mostUsedMethod],
      ['Pagos confirmados', orders.filter((order) => order.payment_status === 'confirmed').length], ['Pagos rechazados', orders.filter((order) => order.payment_status === 'rejected').length], ['Pagos pendientes', orders.filter((order) => order.payment_status === 'pending').length],
      ['Total por producto', JSON.stringify(Object.fromEntries(byProduct))], ['Total por método', JSON.stringify(Object.fromEntries(byMethod))],
    ].map(([metric, value]) => [exportId, now.toISOString().slice(0, 10), now.toTimeString().slice(0, 8), metric, value]);

    const sheetsResponse = await fetch(sheetsUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ secret: sheetsSecret, exportId, exportDate: now.toISOString().slice(0, 10), exportTime: now.toTimeString().slice(0, 8), exportedAt: now.toISOString(), adminName: administrator.full_name, periodId: exportId, totalExported: total, sales, inventory, summary }),
    });
    const receipt = await sheetsResponse.json().catch(() => ({}));
    if (!sheetsResponse.ok || receipt.exportId !== exportId || Number(receipt.receivedSalesCount) !== sales.length) {
      throw new Error('Google Sheets no confirmó todas las ventas. Los datos no fueron modificados.');
    }

    const orderIds = orders.map((order) => order.id);
    if (orderIds.length) {
      const { data: marked, error: markError } = await supabase.from('orders').update({ exported_at: now.toISOString(), export_batch_id: exportId }).in('id', orderIds).is('exported_at', null).select('id');
      if (markError || marked?.length !== orderIds.length) throw new Error('Google Sheets recibió el respaldo, pero no se pudo cerrar el periodo de forma segura. Intenta de nuevo.');
    }
    const { error: completedError } = await supabase.from('sales_export_batches').update({ status: 'completed', completed_at: now.toISOString(), exported_count: orders.length, total }).eq('id', exportId);
    if (completedError) throw completedError;
    return c.json({ exportId, exportedCount: orders.length, total });
  } catch (error) {
    console.error('Google Sheets export failed', error);
    return c.json({ error: error instanceof Error ? error.message : 'No fue posible exportar las ventas a Google Sheets. Los datos no fueron modificados.' }, 500);
  }
});

Deno.serve(app.fetch);
