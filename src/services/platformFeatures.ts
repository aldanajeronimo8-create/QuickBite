import { requireSupabaseClient } from '../lib/supabase';

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
export type StaffRole = 'super_admin' | 'administrator' | 'cafeteria' | 'finance';

const supabase = () => requireSupabaseClient();

export function subscribeToOrder(orderId: string, onChange: (payload: unknown) => void) {
  return supabase().channel(`quickbite-order-${orderId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, onChange)
    .subscribe();
}

export function subscribeToOrderQueue(onChange: (payload: unknown) => void) {
  return supabase().channel('quickbite-order-queue')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onChange)
    .subscribe();
}

export async function setOrderStatus(orderId: string, status: OrderStatus) {
  const { error } = await supabase().rpc('set_order_status', { p_order_id: orderId, p_status: status });
  if (error) throw error;
}

export async function scheduleOrder(orderId: string, pickupSlotId: string, scheduledFor: string) {
  const { data, error } = await supabase().from('orders').update({ pickup_slot_id: pickupSlotId, scheduled_for: scheduledFor }).eq('id', orderId).select().single();
  if (error) throw error;
  return data;
}

export async function listPickupSlots() {
  const { data, error } = await supabase().from('pickup_slots').select('*').eq('enabled', true).order('starts_at');
  if (error) throw error;
  return data;
}

export async function listNotifications(userId: string) {
  const { data, error } = await supabase().from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function markNotificationRead(notificationId: string) {
  const { error } = await supabase().from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId);
  if (error) throw error;
}

export async function listOrderHistory(userId: string) {
  const { data, error } = await supabase().from('orders').select('*, order_items(*, product:products(*))').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getReorderItems(orderId: string) {
  const { data, error } = await supabase().from('order_items').select('product_id, quantity, price, product:products(id,name,price,stock,available,image_url,category_id)').eq('order_id', orderId);
  if (error) throw error;
  return (data ?? []).filter((item) => item.product && item.product.available && item.product.stock > 0);
}

export async function setFavorite(userId: string, productId: string, favorite: boolean) {
  if (favorite) {
    const { error } = await supabase().from('favorites').upsert({ user_id: userId, product_id: productId });
    if (error) throw error;
  } else {
    const { error } = await supabase().from('favorites').delete().eq('user_id', userId).eq('product_id', productId);
    if (error) throw error;
  }
}

export async function listFavorites(userId: string) {
  const { data, error } = await supabase().from('favorites').select('product:products(*)').eq('user_id', userId);
  if (error) throw error;
  return data;
}

export async function searchProducts(term: string) {
  const safe = term.trim().replace(/[%_,]/g, '');
  const { data, error } = await supabase().from('products').select('*, category:categories(*)').eq('available', true).ilike('name', `%${safe}%`).order('name');
  if (error) throw error;
  return data;
}

export async function listMenuByCategory(categoryId?: string) {
  let query = supabase().from('products').select('*, category:categories(*)').eq('available', true).gt('stock', 0).order('name');
  if (categoryId) query = query.eq('category_id', categoryId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function setStockThreshold(productId: string, minimumStock: number, reorderQuantity: number) {
  const { error } = await supabase().from('product_stock_settings').upsert({ product_id: productId, minimum_stock: minimumStock, reorder_quantity: reorderQuantity, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function listLowStockProducts() {
  const { data, error } = await supabase().from('products').select('id,name,stock,available,product_stock_settings(*)').order('stock');
  if (error) throw error;
  type StockProduct = { id: string; name: string; stock: number; available: boolean; product_stock_settings?: Array<{ minimum_stock: number; reorder_quantity: number }> };
  const products = (data ?? []) as StockProduct[];
  return products.filter((product) => {
    const settings = product.product_stock_settings?.[0];
    return Boolean(settings && product.stock <= settings.minimum_stock);
  });
}

export async function listOpenAlerts() {
  const { data, error } = await supabase().from('system_alerts').select('*').is('resolved_at', null).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function resolveAlert(alertId: string) {
  const { error } = await supabase().from('system_alerts').update({ resolved_at: new Date().toISOString() }).eq('id', alertId);
  if (error) throw error;
}

export async function getDailySales(days = 14) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase().from('admin_sales_daily').select('*').gte('business_date', since.slice(0, 10)).order('business_date');
  if (error) throw error;
  return data;
}

export async function getDailySummary(date = new Date().toISOString().slice(0, 10)) {
  const { data, error } = await supabase().from('daily_summaries').select('*').eq('business_date', date).maybeSingle();
  if (error) throw error;
  return data;
}

export async function assignStaffRole(userId: string, role: StaffRole) {
  const { data, error } = await supabase().from('staff_roles').upsert({ user_id: userId, role, updated_at: new Date().toISOString() }).select().single();
  if (error) throw error;
  return data;
}

export async function getStaffRole(userId: string) {
  const { data, error } = await supabase().from('staff_roles').select('role').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data?.role as StaffRole | undefined;
}

export async function recordDemand(productId: string, quantity: number, source: 'order' | 'manual' | 'snapshot' = 'order') {
  const { error } = await supabase().from('demand_observations').insert({ product_id: productId, quantity, source });
  if (error) throw error;
}

export async function getDemandTrend(productId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase().from('demand_observations').select('quantity,observed_at').eq('product_id', productId).gte('observed_at', since).order('observed_at');
  if (error) throw error;
  const values = (data ?? []).map((x) => Number(x.quantity));
  if (!values.length) return { average: 0, peak: 0, trend: 0 };
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const half = Math.max(1, Math.floor(values.length / 2));
  const first = values.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const last = values.slice(-half).reduce((a, b) => a + b, 0) / half;
  return { average, peak: Math.max(...values), trend: last - first };
}

export async function suggestPreparationQuantity(productId: string, safetyFactor = 1.2) {
  const trend = await getDemandTrend(productId, 30);
  return Math.max(0, Math.ceil((trend.average + Math.max(0, trend.trend)) * safetyFactor));
}

export async function recordAutomationJob(jobKey: string, status: 'running' | 'success' | 'failed', attempts = 1, errorMessage?: string) {
  const { data, error } = await supabase().from('automation_jobs').insert({ job_key: jobKey, status, attempts, finished_at: status === 'running' ? null : new Date().toISOString(), error_message: errorMessage ?? null }).select().single();
  if (error) throw error;
  return data;
}
