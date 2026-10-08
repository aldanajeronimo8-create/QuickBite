import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const failures = [];
const warnings = [];
const check = (ok, msg) => ok ? console.log('PASS ' + msg) : (failures.push(msg), console.error('FAIL ' + msg));
const warn = (msg) => { warnings.push(msg); console.warn('WARN ' + msg); };
async function rows(table, select='*') {
  const { data, error } = await db.from(table).select(select);
  if (error) throw new Error(table + ': ' + error.message);
  return data ?? [];
}

console.log('QuickBite Integrity Audit');
console.log('SHA: ' + (process.env.GITHUB_SHA ?? 'local'));

const [profiles, links, contexts, orders, items, products, movements, stockSettings, batches] = await Promise.all([
  rows('profiles','id,email,full_name,role,active,student_code'),
  rows('parent_student_links','id,parent_user_id,student_user_id,relationship,active'),
  rows('parent_active_student_context','parent_user_id,student_user_id'),
  rows('orders','id,user_id,total,status,payment_method,payment_status,order_number,pickup_code,payment_reference,exported_at,export_batch_id'),
  rows('order_items','id,order_id,product_id,quantity,price'),
  rows('products','id,name,price,stock,available'),
  rows('inventory_movements','id,product_id,movement_type,quantity,previous_stock,new_stock,user_id'),
  rows('product_stock_settings','product_id,minimum_stock,reorder_quantity'),
  rows('sales_export_batches','id,status,order_ids,created_by,exported_count,total,created_at,completed_at')
]);

const profileIds = new Set(profiles.map(p => p.id));
const parentIds = new Set(profiles.filter(p => ['parent','both','student_parent'].includes(p.role)).map(p => p.id));
const studentIds = new Set(profiles.filter(p => ['student','both','student_parent'].includes(p.role)).map(p => p.id));
const productIds = new Set(products.map(p => p.id));
const orderIds = new Set(orders.map(o => o.id));

check(links.every(l => parentIds.has(l.parent_user_id) && studentIds.has(l.student_user_id)), 'parent/student links reference valid role profiles');
check(contexts.every(c => parentIds.has(c.parent_user_id) && studentIds.has(c.student_user_id) && links.some(l => l.parent_user_id === c.parent_user_id && l.student_user_id === c.student_user_id && l.active)), 'active parent contexts reference active links');
check(orders.every(o => profileIds.has(o.user_id)), 'orders reference existing profiles');
check(items.every(i => orderIds.has(i.order_id) && productIds.has(i.product_id)), 'order items reference existing orders/products');

const familyCounts = new Map();
for (const l of links.filter(l => l.active)) familyCounts.set(l.parent_user_id, (familyCounts.get(l.parent_user_id) ?? 0) + 1);
const multi = [...familyCounts.values()].filter(n => n > 1).length;
multi ? check(true, multi + ' parent account(s) currently link to multiple students') : warn('No live parent has multiple active students; structural support is verified, but live multi-student coverage needs a fixture.');

const methods = new Set(['nequi','cash','bre-b','credits']);
const paymentStates = new Set(['pending','confirmed','rejected']);
const orderStates = new Set(['pending','preparing','ready','delivered','rejected','cancelled']);
check(orders.every(o => methods.has(o.payment_method)), 'all orders use supported payment methods');
check(orders.every(o => paymentStates.has(o.payment_status)), 'all orders use supported payment states');
check(orders.every(o => orderStates.has(o.status)), 'all orders use supported order states');

const byOrder = new Map();
for (const i of items) { const a = byOrder.get(i.order_id) ?? []; a.push(i); byOrder.set(i.order_id, a); }
let mismatches = 0;
for (const o of orders) {
  const calc = (byOrder.get(o.id) ?? []).reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0);
  if (Math.abs(calc - Number(o.total)) > 0.01) mismatches++;
}
check(mismatches === 0, 'order totals match line items (' + (orders.length - mismatches) + '/' + orders.length + ')');

check(products.every(p => Number.isInteger(p.stock) && p.stock >= 0), 'product stock is non-negative');
const badMovements = movements.filter(m => {
  const delta = Number(m.new_stock) - Number(m.previous_stock);
  if (['sale','reservation'].includes(m.movement_type)) return delta >= 0 || Number(m.quantity) !== Math.abs(delta);
  if (['entry','release','return'].includes(m.movement_type)) return delta <= 0 || Number(m.quantity) !== Math.abs(delta);
  return Number(m.quantity) !== Math.abs(delta);
});
check(badMovements.length === 0, 'inventory movement deltas are consistent (' + (movements.length - badMovements.length) + '/' + movements.length + ')');
const low = products.filter(p => { const s = stockSettings.find(x => x.product_id === p.id); return s && Number(p.stock) <= Number(s.minimum_stock); });
console.log('INFO low-stock products: ' + low.length + '; out-of-stock products: ' + products.filter(p => Number(p.stock) === 0).length);

check(orders.every(o => !o.exported_at || !!o.export_batch_id), 'exported orders are retained and tied to a batch');
const completed = new Set(batches.filter(b => b.status === 'completed').map(b => b.id));
const orphaned = orders.filter(o => o.exported_at && o.export_batch_id && !completed.has(o.export_batch_id));
check(orphaned.length === 0, 'exported orders reference completed batches');
let batchFailures = 0;
for (const b of batches.filter(b => b.status === 'completed')) {
  const ids = Array.isArray(b.order_ids) ? b.order_ids : [];
  if (ids.some(id => !orderIds.has(id))) batchFailures++;
  const total = orders.filter(o => ids.includes(o.id)).reduce((s, o) => s + Number(o.total), 0);
  if (Math.abs(total - Number(b.total)) > 0.01) batchFailures++;
}
check(batchFailures === 0, 'completed export batches match retained order ids and totals');

const requiredTables = ['profiles','parent_student_links','parent_active_student_context','family_link_codes','orders','order_items','products','inventory_movements','product_stock_settings','sales_export_batches'];
for (const table of requiredTables) {
  const { error } = await db.from(table).select('*', { count: 'exact', head: true });
  check(!error, 'live table available: ' + table);
}

if (warnings.length) console.log('WARNINGS: ' + warnings.length);
if (failures.length) {
  console.error('INTEGRITY AUDIT FAILED: ' + failures.length + ' failure(s)');
  failures.forEach(f => console.error(' - ' + f));
  process.exit(1);
}
console.log('INTEGRITY AUDIT: PASS');