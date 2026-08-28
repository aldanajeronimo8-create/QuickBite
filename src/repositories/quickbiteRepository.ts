import {
  requireSupabaseClient,
  type Category,
  type AdminLoyaltyRedemption,
  type LoyaltyRedemption,
  type LoyaltyReward,
  type LoyaltySettings,
  type Order,
  type OrderItem,
  type Product,
  type Profile,
  type UserNotification,
} from '../lib/supabase';
import { getErrorMessage } from '../lib/errorMessage';

export type NewProduct = Omit<Product, 'id' | 'created_at' | 'category'>;
export type ProductUpdate = Partial<NewProduct>;
export type NewOrderItem = Omit<OrderItem, 'id' | 'order_id' | 'product'>;
export type NewOrder = Omit<Order, 'id' | 'created_at' | 'order_number' | 'order_items' | 'user' | 'user_id'> & {
  user_id: string;
  order_items?: NewOrderItem[];
};
export type NewManagedUser = {
  email: string;
  password: string;
  full_name: string;
  role: Profile['role'];
  ti?: string;
};
export type ManagedUserUpdate = Omit<NewManagedUser, 'password'> & { id: string; password?: string };
export type ProtectedCredentialsUpdate = { id: string; email: string; password?: string };
export type LoyaltyRewardInput = Pick<LoyaltyReward, 'product_id' | 'title' | 'description' | 'points_required' | 'active'>;
export type LoyaltyRewardUpdate = Partial<LoyaltyRewardInput>;

function isMissingRpc(error: unknown) {
  const message = getErrorMessage(error, '');
  return /function.*does not exist|could not find the function|schema cache/i.test(message);
}

function productRpcError(error: unknown) {
  const message = getErrorMessage(error, '');
  if (/not_authorized/i.test(message)) return new Error('No tienes permisos de administrador para modificar productos.');
  if (/product_not_found/i.test(message)) return new Error('El producto ya no existe en Supabase.');
  if (/invalid_stock/i.test(message)) return new Error('El stock debe ser un número mayor o igual que 0.');
  if (/invalid_price/i.test(message)) return new Error('El precio debe ser mayor o igual a 0.');
  return error;
}

function orderStatusRpcError(error: unknown) {
  const message = getErrorMessage(error, 'No se pudo actualizar el estado del pedido.');
  if (/not_authorized|row-level security|permission denied/i.test(message)) return new Error('Tu sesión no tiene permisos de administrador para actualizar pedidos.');
  if (/invalid_order_status/i.test(message)) return new Error('El estado seleccionado no es valido.');
  if (/order_not_found/i.test(message)) return new Error('El pedido ya no existe o no esta disponible.');
  return new Error(message);
}

function loyaltyRpcError(error: unknown) {
  const message = getErrorMessage(error, 'No se pudo procesar el canje.');
  if (/not_authorized/i.test(message)) return new Error('Tu sesión no puede canjear recompensas.');
  if (/loyalty_disabled/i.test(message)) return new Error('El programa de puntos esta desactivado por el administrador.');
  if (/reward_not_found|reward_unavailable/i.test(message)) return new Error('Esta recompensa ya no esta disponible.');
  if (/reward_out_of_stock/i.test(message)) return new Error('Esta recompensa se agoto. Elige otra opcion.');
  if (/insufficient_loyalty_points|insufficient_points/i.test(message)) return new Error('No tienes puntos suficientes para este canje.');
  return new Error(message);
}

function loyaltyFulfillmentError(error: unknown) {
  const message = getErrorMessage(error, 'No se pudo entregar el canje.');
  if (/not_authorized/i.test(message)) return new Error('Tu sesión no puede entregar canjes.');
  if (/redemption_not_found/i.test(message)) return new Error('El canje ya no existe.');
  if (/redemption_not_available/i.test(message)) return new Error('Este canje ya fue entregado o cancelado.');
  if (/invalid_redemption_code/i.test(message)) return new Error('El codigo del canje no coincide.');
  return new Error(message);
}

export async function listCategories() {
  const { data, error } = await requireSupabaseClient().from('categories').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function listProducts() {
  const { data, error } = await requireSupabaseClient().from('products').select('*, category:categories(*)').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Product[];
}

async function getProductById(id: string) {
  const { data, error } = await requireSupabaseClient().from('products').select('*, category:categories(*)').eq('id', id).single();
  if (error) throw error;
  return data as Product;
}

export async function createProduct(product: NewProduct) {
  const supabase = requireSupabaseClient();
  const { data: productId, error: rpcError } = await supabase.rpc('admin_create_product', {
    p_name: product.name, p_description: product.description ?? null, p_price: product.price,
    p_image_url: product.image_url ?? null, p_category_id: product.category_id, p_stock: product.stock, p_available: product.available,
  });
  if (!rpcError) return getProductById(String(productId));
  if (!isMissingRpc(rpcError)) throw productRpcError(rpcError);
  const { data, error } = await supabase.from('products').insert(product).select('*, category:categories(*)').single();
  if (error) throw productRpcError(error);
  return data as Product;
}

export async function updateProduct(id: string, updates: ProductUpdate) {
  const supabase = requireSupabaseClient();
  const { data: productId, error: rpcError } = await supabase.rpc('admin_update_product', {
    p_product_id: id, p_name: updates.name ?? null, p_description: updates.description ?? null, p_price: updates.price ?? null,
    p_image_url: updates.image_url ?? null, p_category_id: updates.category_id ?? null, p_stock: updates.stock ?? null, p_available: updates.available ?? null,
  });
  if (!rpcError) return getProductById(String(productId));
  if (!isMissingRpc(rpcError)) throw productRpcError(rpcError);
  const { data, error } = await supabase.from('products').update(updates).eq('id', id).select('*, category:categories(*)').single();
  if (error) throw productRpcError(error);
  return data as Product;
}

export async function deleteProduct(id: string) {
  const supabase = requireSupabaseClient();
  const { error: rpcError } = await supabase.rpc('admin_delete_product', { p_product_id: id });
  if (!rpcError) return;
  if (!isMissingRpc(rpcError)) throw productRpcError(rpcError);
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw productRpcError(error);
}

export async function listOrders() {
  const { data, error } = await requireSupabaseClient().from('orders').select('*, order_items(*, product:products(*)), user:profiles(*)').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Order[];
}

async function getOrderById(id: string) {
  const { data, error } = await requireSupabaseClient().from('orders').select('*, order_items(*, product:products(*)), user:profiles(*)').eq('id', id).single();
  if (error) throw orderStatusRpcError(error);
  return data as Order;
}

export async function listOrdersForExport(sinceIso: string, limit = 10000) {
  const supabase = requireSupabaseClient();
  const safeLimit = Math.min(Math.max(limit, 1), 10000);
  const batchSize = 1000;
  const orders: Order[] = [];
  while (orders.length < safeLimit) {
    const from = orders.length;
    const to = Math.min(from + batchSize - 1, safeLimit - 1);
    const { data, error } = await supabase.from('orders').select('*, order_items(*, product:products(*)), user:profiles(*)').gte('created_at', sinceIso).order('created_at', { ascending: false }).range(from, to);
    if (error) throw error;
    const batch = (data ?? []) as Order[];
    orders.push(...batch);
    if (batch.length < to - from + 1) break;
  }
  return orders;
}

export async function createOrder(order: NewOrder) {
  const { order_items = [], ...orderFields } = order;
  const { data, error } = await requireSupabaseClient().rpc('create_order_tx', {
    p_user_id: orderFields.user_id,
    p_payment_method: orderFields.payment_method,
    p_payment_status: orderFields.payment_status,
    p_status: orderFields.status,
    p_pickup_code: orderFields.pickup_code ?? null,
    p_estimated_minutes: orderFields.estimated_minutes ?? null,
    p_payment_reference: orderFields.payment_reference ?? null,
    p_items: order_items.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
    p_notes: orderFields.notes ?? null,
  });
  if (error) throw error;
  return String(data);
}

export async function updateOrder(id: string, updates: Partial<Order>) {
  const { data, error } = await requireSupabaseClient().from('orders').update(updates).eq('id', id).select('*, order_items(*, product:products(*)), user:profiles(*)').single();
  if (error) throw error;
  return data as Order;
}

export async function archiveOrders(ids: string[]) {
  if (!ids.length) return 0;
  const { data, error } = await requireSupabaseClient().from('orders').update({ admin_hidden: true }).in('id', ids).select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

export async function resetOrdersForNewPeriod() {
  const { data, error } = await requireSupabaseClient().from('orders').update({ admin_hidden: true }).eq('admin_hidden', false).select('id');
  if (error) throw error;
  return data?.length ?? 0;
}
