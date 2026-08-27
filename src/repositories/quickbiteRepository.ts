import {
  requireSupabaseClient,
  type Category,
  type LoyaltyRedemption,
  type LoyaltyReward,
  type LoyaltySettings,
  type Order,
  type OrderItem,
  type Product,
  type Profile,
} from '../lib/supabase';

export type NewProduct = Omit<Product, 'id' | 'created_at' | 'category'>;
export type ProductUpdate = Partial<NewProduct>;
export type NewOrderItem = Omit<OrderItem, 'id' | 'order_id' | 'product'>;
export type NewOrder = Omit<
  Order,
  'id' | 'created_at' | 'order_number' | 'order_items' | 'user'
> & {
  order_items?: NewOrderItem[];
};
export type NewManagedUser = {
  email: string;
  password: string;
  full_name: string;
  role: Profile['role'];
  ti?: string;
};
export type ManagedUserUpdate = Omit<NewManagedUser, 'password'> & {
  id: string;
  password?: string;
};

function isMissingRpc(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /function.*does not exist|could not find the function|schema cache/i.test(message);
}

function productRpcError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/not_authorized/i.test(message)) {
    return new Error('No tienes permisos de administrador para modificar productos.');
  }
  if (/product_not_found/i.test(message)) {
    return new Error('El producto ya no existe en Supabase.');
  }
  if (/invalid_stock/i.test(message)) {
    return new Error('El stock debe ser un numero mayor o igual a 0.');
  }
  if (/invalid_price/i.test(message)) {
    return new Error('El precio debe ser mayor o igual a 0.');
  }
  return error;
}

export async function listCategories() {
  const { data, error } = await requireSupabaseClient()
    .from('categories')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function listProducts() {
  const { data, error } = await requireSupabaseClient()
    .from('products')
    .select('*, category:categories(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Product[];
}

async function getProductById(id: string) {
  const { data, error } = await requireSupabaseClient()
    .from('products')
    .select('*, category:categories(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Product;
}

export async function createProduct(product: NewProduct) {
  const supabase = requireSupabaseClient();
  const { data: productId, error: rpcError } = await supabase.rpc('admin_create_product', {
    p_name: product.name,
    p_description: product.description ?? null,
    p_price: product.price,
    p_image_url: product.image_url ?? null,
    p_category_id: product.category_id,
    p_stock: product.stock,
    p_available: product.available,
  });

  if (!rpcError) return getProductById(String(productId));
  if (!isMissingRpc(rpcError)) throw productRpcError(rpcError);

  const { data, error } = await supabase
    .from('products')
    .insert(product)
    .select('*, category:categories(*)')
    .single();
  if (error) throw productRpcError(error);
  return data as Product;
}

export async function updateProduct(id: string, updates: ProductUpdate) {
  const supabase = requireSupabaseClient();
  const { data: productId, error: rpcError } = await supabase.rpc('admin_update_product', {
    p_product_id: id,
    p_name: updates.name ?? null,
    p_description: updates.description ?? null,
    p_price: updates.price ?? null,
    p_image_url: updates.image_url ?? null,
    p_category_id: updates.category_id ?? null,
    p_stock: updates.stock ?? null,
    p_available: updates.available ?? null,
  });

  if (!rpcError) return getProductById(String(productId));
  if (!isMissingRpc(rpcError)) throw productRpcError(rpcError);

  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select('*, category:categories(*)')
    .single();
  if (error) throw productRpcError(error);
  return data as Product;
}

export async function deleteProduct(id: string) {
  const supabase = requireSupabaseClient();
  const { error: rpcError } = await supabase.rpc('admin_delete_product', {
    p_product_id: id,
  });
  if (!rpcError) return;
  if (!isMissingRpc(rpcError)) throw productRpcError(rpcError);

  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw productRpcError(error);
}

export async function listOrders() {
  const { data, error } = await requireSupabaseClient()
    .from('orders')
    .select('*, order_items(*, product:products(*)), user:profiles(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Order[];
}

export async function listOrdersForExport(sinceIso: string, limit = 10000) {
  const supabase = requireSupabaseClient();
  const safeLimit = Math.min(Math.max(limit, 1), 10000);
  const batchSize = 1000;
  const orders: Order[] = [];

  while (orders.length < safeLimit) {
    const from = orders.length;
    const to = Math.min(from + batchSize - 1, safeLimit - 1);
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, product:products(*)), user:profiles(*)')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const batch = (data ?? []) as Order[];
    orders.push(...batch);

    if (batch.length < to - from + 1) break;
  }

  return orders;
}

/**
 * Loads the complete order history in pages so an export is never truncated
 * before the administrator clears the operational orders.
 */
export async function listAllOrdersForExport() {
  const supabase = requireSupabaseClient();
  const batchSize = 1000;
  const maximumRows = 100000;
  const orders: Order[] = [];

  while (orders.length < maximumRows) {
    const from = orders.length;
    const to = Math.min(from + batchSize - 1, maximumRows - 1);
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, product:products(*)), user:profiles(*)')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const batch = (data ?? []) as Order[];
    orders.push(...batch);
    if (batch.length < batchSize) return orders;
  }

  throw new Error(
    'El historial supera 100.000 pedidos. Exporta una copia con soporte antes de reiniciar los pedidos.',
  );
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
    p_items: order_items.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
    })),
  });
  if (error) throw error;
  return String(data);
}

export async function updateOrder(id: string, updates: Partial<Order>) {
  const { data, error } = await requireSupabaseClient()
    .from('orders')
    .update(updates)
    .eq('id', id)
    .select('*, order_items(*, product:products(*)), user:profiles(*)')
    .single();
  if (error) throw error;
  return data as Order;
}

export async function deleteOrder(id: string) {
  const { error } = await requireSupabaseClient().from('orders').delete().eq('id', id);
  if (error) throw error;
}

export async function listProfiles() {
  const { data, error } = await requireSupabaseClient()
    .from('profiles')
    .select('id,email,full_name,role,ti,created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function getProfile(userId: string) {
  const { data, error } = await requireSupabaseClient()
    .from('profiles')
    .select('id,email,full_name,role,ti,created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function getLoyaltySettings() {
  const { data, error } = await requireSupabaseClient()
    .from('loyalty_settings')
    .select('*')
    .eq('id', true)
    .single();
  if (error) throw error;
  return data as LoyaltySettings;
}

export async function updateLoyaltySettings(updates: Partial<LoyaltySettings>) {
  const { data, error } = await requireSupabaseClient()
    .from('loyalty_settings')
    .update(updates)
    .eq('id', true)
    .select('*')
    .single();
  if (error) throw error;
  return data as LoyaltySettings;
}

export async function listLoyaltyRewards() {
  const { data, error } = await requireSupabaseClient()
    .from('loyalty_rewards')
    .select('*')
    .order('points_cost');
  if (error) throw error;
  return (data ?? []) as LoyaltyReward[];
}

export async function listUserLoyaltyRedemptions(userId: string) {
  const { data, error } = await requireSupabaseClient()
    .from('loyalty_redemptions')
    .select('*, reward:loyalty_rewards(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LoyaltyRedemption[];
}

export async function redeemLoyaltyReward(rewardId: string) {
  const { data, error } = await requireSupabaseClient().rpc('redeem_loyalty_reward', {
    p_reward_id: rewardId,
  });
  if (error) throw error;
  return data as LoyaltyRedemption;
}

export async function listProtectedAdminEmails() {
  const { data, error } = await requireSupabaseClient().rpc('list_protected_admin_emails');
  if (error) throw error;
  return new Set<string>((data ?? []).map((row: { email: string }) => row.email.toLowerCase()));
}

export async function createManagedUser(user: NewManagedUser) {
  const { data, error } = await requireSupabaseClient().rpc('admin_create_user', {
    p_email: user.email,
    p_password: user.password,
    p_full_name: user.full_name,
    p_role: user.role,
    p_ti: user.ti ?? null,
  });
  if (error) throw error;
  return String(data);
}

export async function updateManagedUser(user: ManagedUserUpdate) {
  const supabase = requireSupabaseClient();
  const payload = {
    p_user_id: user.id,
    p_email: user.email,
    p_full_name: user.full_name,
    p_role: user.role,
    p_ti: user.ti ?? null,
    p_password: user.password?.trim() || null,
  };
  const { error } = await supabase.rpc('admin_update_user', payload);
  if (!error) return;

  if (isMissingRpc(error) && !payload.p_password) {
    const { error: legacyError } = await supabase.rpc('admin_update_user', {
      p_user_id: user.id,
      p_email: user.email,
      p_full_name: user.full_name,
      p_role: user.role,
      p_ti: user.ti ?? null,
    });
    if (!legacyError) return;
    throw legacyError;
  }

  if (isMissingRpc(error) && payload.p_password) {
    throw new Error('Falta aplicar la migracion de contrasenas admin en Supabase.');
  }

  throw error;
}

export async function deleteManagedUser(id: string) {
  const { error } = await requireSupabaseClient().rpc('admin_delete_user', {
    p_user_id: id,
  });
  if (error) throw error;
}

export async function writeAudit(entry: {
  action: string;
  actor_id?: string;
  actor_email?: string;
  entity?: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await requireSupabaseClient()
    .from('audit_logs')
    .insert({
      action: entry.action,
      actor_id: entry.actor_id,
      actor_email: entry.actor_email,
      entity: entry.entity,
      entity_id: entry.entity_id,
      metadata: entry.metadata ?? {},
    });
  if (error) throw error;
}
