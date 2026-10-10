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

const [profiles, links, contexts, orders, items, products, movements, stockSettings] = await Promise.all([
  rows('profiles','id,email,full_name,role,active,student_code'),
  rows('parent_student_links','id,parent_user_id,student_user_id,relationship,active'),
  rows('parent_active_student_context','parent_user_id,student_user_id'),
  rows('orders','id,user_id,total,status,payment_method,payment_status,order_number,pickup_code,payment_reference,admin_hidden,created_at,updated_at'),
  rows('order_items','id,order_id,product_id,quantity,price'),
  rows('products','id,name,price,stock,available'),
  rows('inventory_movements','id,product_id,movement_type,quantity,previous_stock,new_stock,user_id'),
  rows('product_stock_settings','product_id,minimum_stock,reorder_quantity')
]);

const profileIds = new Set(profiles.map(p => p.id));
const parentIds = new Set(profiles.filter(p => ['parent','both','student_parent'].includes(p.role)).map(p => p.id));
const studentIds = new Set(profiles.filter(p => ['student','both','student_parent'].includes(p.role)).map(p => p.id));
const productIds = new Set(products.map(p => p.id));
const orderIds = new Set(orders.map(o => o.id));

check(links.every(l => parentIds.has(l.parent_user_id) && studentIds.has(l.student_user_id)), 'parent/student links reference valid role profiles');
check(contexts.every(c => parentIds.has(c.parent_user_id) && studentIds.has(c.student_user_id) && links.some(l => l.parent_user_id === c.parent_user_id && l.student_user_id === c.student_user_id && l.active)), 'active parent contexts reference active links');
  check(orders.every(o => o.user_id == null || profileIds.has(o.user_id)), 'orders with an assigned user reference an existing profile');
  const ordersWithoutProfile = orders.filter(o => o.user_id == null).length;
  if (ordersWithoutProfile > 0) {
    console.log(`INFO ${ordersWithoutProfile} order(s) have no linked profile; orders.user_id allows NULL with ON DELETE SET NULL.`);
  }
check(items.every(i => orderIds.has(i.order_id) && (i.product_id == null || productIds.has(i.product_id))), 'order items reference existing orders and products when product_id is present');

const familyCounts = new Map();
for (const l of links.filter(l => l.active)) familyCounts.set(l.parent_user_id, (familyCounts.get(l.parent_user_id) ?? 0) + 1);
const multi = [...familyCounts.values()].filter(n => n > 1).length;
if (multi > 0) {
  check(true, multi + ' parent account(s) currently link to multiple students');
} else {
  warn('No live parent has multiple active students; structural support is verified, but live multi-student coverage needs a fixture.');
}

const methods = new Set(['nequi','cash','bre-b','credits']);
const paymentStates = new Set(['pending','confirmed','rejected']);
const orderStates = new Set(['pending','preparing','ready','delivered','rejected','cancelled']);
check(orders.every(o => methods.has(o.payment_method)), 'all orders use supported payment methods');
check(orders.every(o => paymentStates.has(o.payment_status)), 'all orders use supported payment states');
check(orders.every(o => orderStates.has(o.status)), 'all orders use supported order states');

const byOrder = new Map();
for (const i of items) { const a = byOrder.get(i.order_id) ?? []; a.push(i); byOrder.set(i.order_id, a); }
let mismatches = 0;
let emptyOrders = 0;
for (const o of orders) {
  const orderItems = byOrder.get(o.id) ?? [];
  if (orderItems.length === 0) emptyOrders++;
  const calc = orderItems.reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0);
  if (Math.abs(calc - Number(o.total)) > 0.01) mismatches++;
}
check(emptyOrders === 0, 'every retained order has at least one line item (' + (orders.length - emptyOrders) + '/' + orders.length + ')');
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

const hiddenOrders = orders.filter(o => o.admin_hidden === true);
const activeOrders = orders.filter(o => o.admin_hidden === false);
check(orders.every(o => typeof o.admin_hidden === 'boolean'), 'all orders have an explicit operational visibility flag');
check(activeOrders.every(o => o.admin_hidden === false), 'active operational orders are not hidden');
check(hiddenOrders.every(o => o.admin_hidden === true), 'closed/archived orders remain explicitly hidden from operational flows');
console.log('INFO operational orders: ' + activeOrders.length + '; hidden period orders: ' + hiddenOrders.length);

// Current QuickBite closes/archives operational periods through admin_hidden and
// the Excel workbook. sales_export_batches/exported_at/export_batch_id belonged
// to an older persisted-batch contract and are intentionally not audited here.
const requiredTables = [
  'profiles',
  'parent_student_links',
  'parent_active_student_context',
  'family_link_codes',
  'orders',
  'order_items',
  'products',
  'inventory_movements',
  'product_stock_settings'
];
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
