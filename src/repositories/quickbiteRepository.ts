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
  type SystemHealthCheck,
  type UserNotification,
  type StaffOrder,
} from '../lib/supabase';
import { getErrorMessage } from '../lib/errorMessage';
import { withRetry } from '../lib/retry';

export type NewProduct = Omit<Product, 'id' | 'created_at' | 'category'>;
export type ProductUpdate = Partial<NewProduct>;
export type ProductNutritionInput = {
  detailed_description: string | null;
  ingredients: string;
  allergens: string | null;
  calories: number | null;
  protein_g: number | null;
  carbohydrates_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  vegetarian: boolean;
  healthy_choice: boolean;
  ingredients_verified: boolean;
  nutrition_verified: boolean;
  nutrition_source: 'manual' | 'ai_draft' | 'label';
};
export type ProductWithNutritionInput = {
  productId?: string | null;
  product: NewProduct;
  nutrition: ProductNutritionInput;
};
export type ProductWithNutritionSaveResult = {
  productId: string;
  product: Product | null;
  verified: boolean;
  verificationMessage?: string;
};
export type NewOrderItem = Omit<OrderItem, 'id' | 'order_id' | 'product'>;
export type NewOrder = Omit<Order, 'id' | 'created_at' | 'order_number' | 'order_items' | 'user' | 'user_id'> & {
  user_id: string;
  order_items?: NewOrderItem[];
};
export type NewManagedUser = { email: string; password: string; full_name: string; role: Profile['role']; ti?: string; section_id?: string; grade_id?: string; course_id?: string };
export type ManagedUserUpdate = Omit<NewManagedUser, 'password'> & { id: string; password?: string };
export type ProtectedCredentialsUpdate = { id: string; email: string; password?: string };
export type LoyaltyRewardInput = Pick<LoyaltyReward, 'product_id' | 'title' | 'description' | 'points_required' | 'active'>;
export type LoyaltyRewardUpdate = Partial<LoyaltyRewardInput>;

function isMissingRpc(error: unknown) { const message = getErrorMessage(error, ''); return /function.*does not exist|could not find the function|schema cache/i.test(message); }
function productRpcError(error: unknown) { const message = getErrorMessage(error, ''); if (/not_authorized/i.test(message)) return new Error('No tienes permisos de administrador para modificar productos.'); if (/product_not_found/i.test(message)) return new Error('El producto ya no existe en Supabase.'); if (/invalid_stock/i.test(message)) return new Error('El stock debe ser un número mayor o igual que 0.'); if (/invalid_price/i.test(message)) return new Error('El precio debe ser mayor que 0.'); if (/category_required/i.test(message)) return new Error('Selecciona una categoría válida.'); if (/ingredients_must_be_verified_before_publish/i.test(message)) return new Error('Verifica los ingredientes reales antes de publicar el producto.'); if (/ingredients_required_for_verification/i.test(message)) return new Error('Agrega los ingredientes antes de marcarlos como verificados.'); if (/invalid_nutrition_value/i.test(message)) return new Error('Los valores nutricionales no pueden ser negativos.'); if (/invalid_nutrition_source/i.test(message)) return new Error('La fuente de la ficha nutricional no es válida.'); return error; }
function orderStatusRpcError(error: unknown) { const message = getErrorMessage(error, 'No se pudo actualizar el estado del pedido.'); if (/not_authorized|row-level security|permission denied/i.test(message)) return new Error('Tu sesión no tiene permisos de administrador para actualizar pedidos.'); if (/invalid_order_status/i.test(message)) return new Error('El estado seleccionado no es valido.'); if (/order_not_found/i.test(message)) return new Error('El pedido ya no existe o no esta disponible.'); return new Error(message); }
function paymentModerationError(error: unknown) { const message = getErrorMessage(error, 'No se pudo actualizar el pago.'); if (/not_authorized|not_admin|row-level security|permission denied/i.test(message)) return new Error('Tu sesión no tiene permisos de administrador para revisar pagos.'); if (/payment_already_reviewed/i.test(message)) return new Error('Este pago ya fue revisado. Actualiza la página para ver su estado actual.'); if (/order_not_found/i.test(message)) return new Error('El pedido ya no existe o no está disponible.'); return new Error(message); }
function loyaltyRpcError(error: unknown) { const message = getErrorMessage(error, 'No se pudo procesar el canje.'); if (/not_authorized/i.test(message)) return new Error('Tu sesión no puede canjear recompensas.'); if (/loyalty_disabled/i.test(message)) return new Error('El programa de puntos esta desactivado por el administrador.'); if (/reward_not_found|reward_unavailable/i.test(message)) return new Error('Esta recompensa ya no esta disponible.'); if (/reward_out_of_stock/i.test(message)) return new Error('Esta recompensa se agoto. Elige otra opcion.'); if (/insufficient_loyalty_points|insufficient_points/i.test(message)) return new Error('No tienes puntos suficientes para este canje.'); return new Error(message); }
function loyaltyFulfillmentError(error: unknown) { const message = getErrorMessage(error, 'No se pudo entregar el canje.'); if (/not_authorized/i.test(message)) return new Error('Tu sesión no puede entregar canjes.'); if (/redemption_not_found/i.test(message)) return new Error('El canje ya no existe.'); if (/redemption_not_available/i.test(message)) return new Error('Este canje ya fue entregado o cancelado.'); if (/invalid_redemption_code/i.test(message)) return new Error('El codigo del canje no coincide.'); return new Error(message); }

export async function listCategories() { const data = await withRetry(async () => { const { data, error } = await requireSupabaseClient().from('categories').select('*').order('name'); if (error) throw error; return data; }); return (data ?? []) as Category[]; }
export async function listProducts() { const data = await withRetry(async () => { const { data, error } = await requireSupabaseClient().from('products').select('*, category:categories(*)').order('created_at', { ascending: false }); if (error) throw error; return data; }); return (data ?? []) as Product[]; }
async function getProductById(id: string) { const { data, error } = await requireSupabaseClient().from('products').select('*, category:categories(*)').eq('id', id).single(); if (error) throw error; return data as Product; }
export async function createProduct(product: NewProduct) { const supabase = requireSupabaseClient(); const { data: productId, error: rpcError } = await supabase.rpc('admin_create_product', { p_name: product.name, p_description: product.description ?? null, p_price: product.price, p_image_url: product.image_url ?? null, p_category_id: product.category_id, p_stock: product.stock, p_available: product.available }); if (!rpcError) return getProductById(String(productId)); if (!isMissingRpc(rpcError)) throw productRpcError(rpcError); const { data, error } = await supabase.from('products').insert(product).select('*, category:categories(*)').single(); if (error) throw productRpcError(error); return data as Product; }
export async function updateProduct(id: string, updates: ProductUpdate) { const supabase = requireSupabaseClient(); const { data: productId, error: rpcError } = await supabase.rpc('admin_update_product', { p_product_id: id, p_name: updates.name ?? null, p_description: updates.description ?? null, p_price: updates.price ?? null, p_image_url: updates.image_url ?? null, p_category_id: updates.category_id ?? null, p_stock: updates.stock ?? null, p_available: updates.available ?? null }); if (!rpcError) return getProductById(String(productId)); if (!isMissingRpc(rpcError)) throw productRpcError(rpcError); const { data, error } = await supabase.from('products').update(updates).eq('id', id).select('*, category:categories(*)').single(); if (error) throw productRpcError(error); return data as Product; }

function sameNullableText(actual: unknown, expected: string | null | undefined) {
  const normalize = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
  return normalize(actual) === normalize(expected);
}
function sameNullableNumber(actual: unknown, expected: number | null) {
  if (expected === null) return actual === null || actual === undefined;
  return actual !== null && actual !== undefined && Number(actual) === expected;
}

/**
 * Stores the product and nutrition row in one PostgreSQL transaction, then reads
 * both rows back to verify the committed values before the UI reports success.
 */
export async function saveProductWithNutrition(input: ProductWithNutritionInput): Promise<ProductWithNutritionSaveResult> {
  const { product, nutrition } = input;
  const { data, error } = await requireSupabaseClient().rpc('admin_save_product_with_nutrition', {
    p_product_id: input.productId ?? null,
    p_name: product.name,
    p_description: product.description ?? null,
    p_price: product.price,
    p_image_url: product.image_url ?? null,
    p_category_id: product.category_id,
    p_stock: product.stock,
    p_available: product.available,
    p_detailed_description: nutrition.detailed_description,
    p_ingredients: nutrition.ingredients,
    p_allergens: nutrition.allergens,
    p_calories: nutrition.calories,
    p_protein_g: nutrition.protein_g,
    p_carbohydrates_g: nutrition.carbohydrates_g,
    p_fat_g: nutrition.fat_g,
    p_fiber_g: nutrition.fiber_g,
    p_vegetarian: nutrition.vegetarian,
    p_healthy_choice: nutrition.healthy_choice,
    p_ingredients_verified: nutrition.ingredients_verified,
    p_nutrition_verified: nutrition.nutrition_verified,
    p_nutrition_source: nutrition.nutrition_source,
  });
  if (error) throw productRpcError(error);
  if (typeof data !== 'string' || !data) {
    throw new Error('Supabase no devolvió el identificador del producto guardado.');
  }

  const productId = data;
  let savedProduct: Product | null = null;
  try {
    savedProduct = await getProductById(productId);
    const { data: savedNutrition, error: nutritionError } = await requireSupabaseClient()
      .from('product_nutrition')
      .select('product_id,detailed_description,ingredients,allergens,calories,protein_g,carbohydrates_g,fat_g,fiber_g,vegetarian,healthy_choice,ingredients_verified,nutrition_verified,nutrition_source')
      .eq('product_id', productId)
      .maybeSingle();
    if (nutritionError) throw nutritionError;
    if (!savedNutrition) throw new Error('La ficha nutricional no aparece después de guardar.');

    const productMatches =
      sameNullableText(savedProduct.name, product.name) &&
      sameNullableText(savedProduct.description, product.description) &&
      sameNullableNumber(savedProduct.price, product.price) &&
      sameNullableText(savedProduct.image_url, product.image_url) &&
      savedProduct.category_id === product.category_id &&
      Number(savedProduct.stock) === product.stock &&
      savedProduct.available === product.available;
    const nutritionMatches =
      savedNutrition.product_id === productId &&
      sameNullableText(savedNutrition.detailed_description, nutrition.detailed_description) &&
      sameNullableText(savedNutrition.ingredients, nutrition.ingredients) &&
      sameNullableText(savedNutrition.allergens, nutrition.allergens) &&
      sameNullableNumber(savedNutrition.calories, nutrition.calories) &&
      sameNullableNumber(savedNutrition.protein_g, nutrition.protein_g) &&
      sameNullableNumber(savedNutrition.carbohydrates_g, nutrition.carbohydrates_g) &&
      sameNullableNumber(savedNutrition.fat_g, nutrition.fat_g) &&
      sameNullableNumber(savedNutrition.fiber_g, nutrition.fiber_g) &&
      savedNutrition.vegetarian === nutrition.vegetarian &&
      savedNutrition.healthy_choice === nutrition.healthy_choice &&
      savedNutrition.ingredients_verified === nutrition.ingredients_verified &&
      savedNutrition.nutrition_verified === nutrition.nutrition_verified &&
      savedNutrition.nutrition_source === nutrition.nutrition_source;

    if (productMatches && nutritionMatches) {
      return { productId, product: savedProduct, verified: true };
    }
    return {
      productId,
      product: savedProduct,
      verified: false,
      verificationMessage: 'Supabase completó la transacción, pero la lectura posterior no coincide con todos los valores enviados.',
    };
  } catch (verificationError) {
    return {
      productId,
      product: savedProduct,
      verified: false,
      verificationMessage: `La transacción se guardó, pero no se pudo completar la verificación posterior: ${getErrorMessage(verificationError, 'error de lectura')}`,
    };
  }
}
export async function deleteProduct(id: string) { const supabase = requireSupabaseClient(); const { error: rpcError } = await supabase.rpc('admin_delete_product', { p_product_id: id }); if (rpcError) { if (!isMissingRpc(rpcError)) throw productRpcError(rpcError); const { error } = await supabase.from('products').delete().eq('id', id); if (error) throw productRpcError(error); } const { data: remaining, error: verifyError } = await supabase.from('products').select('id').eq('id', id).maybeSingle(); if (verifyError) throw new Error('La eliminación se ejecutó, pero no se pudo verificar la ausencia del producto: ' + verifyError.message); if (remaining) throw new Error('El producto todavía existe en Supabase; no se confirmó la eliminación.'); }
export async function listStaffActiveOrders() {
  const { data, error } = await requireSupabaseClient().rpc('staff_list_active_orders');
  if (error) throw error;
  return (data ?? []) as StaffOrder[];
}

export async function updateStaffOrderStatus(id: string, status: Extract<Order['status'], 'preparing' | 'ready' | 'delivered'>) {
  const { data, error } = await requireSupabaseClient().rpc('staff_update_order_status', { p_order_id: id, p_status: status });
  if (error) {
    const message = getErrorMessage(error, 'No se pudo actualizar el pedido.');
    if (/not_authorized|row-level security|permission denied/i.test(message)) throw new Error('Tu cuenta no tiene permisos de Staff.');
    if (/invalid_order_transition/i.test(message)) throw new Error('El pedido debe avanzar en orden: pendiente, preparación, listo y entregado.');
    if (/order_not_found/i.test(message)) throw new Error('El pedido ya no existe o no está disponible.');
    if (/immutable/i.test(message)) throw new Error('Este pedido ya está cerrado.');
    throw new Error(message);
  }
  return String(data ?? id);
}

export async function listOrders() { const data = await withRetry(async () => { const { data, error } = await requireSupabaseClient().from('orders').select('*, order_items(*, product:products(*)), user:profiles(*)').eq('admin_hidden', false).order('created_at', { ascending: false }); if (error) throw error; return data; }); return (data ?? []) as Order[]; }
async function getOrderById(id: string) { const { data, error } = await requireSupabaseClient().from('orders').select('*, order_items(*, product:products(*)), user:profiles(*)').eq('id', id).single(); if (error) throw orderStatusRpcError(error); return data as Order; }
export async function listOrdersForExport(sinceIso: string, limit = 10000) { const supabase = requireSupabaseClient(); const safeLimit = Math.min(Math.max(limit, 1), 10000); const batchSize = 1000; const orders: Order[] = []; while (orders.length < safeLimit) { const from = orders.length; const to = Math.min(from + batchSize - 1, safeLimit - 1); const { data, error } = await supabase.from('orders').select('*, order_items(*, product:products(*)), user:profiles(*)').gte('created_at', sinceIso).order('created_at', { ascending: false }).range(from, to); if (error) throw error; const batch = (data ?? []) as Order[]; orders.push(...batch); if (batch.length < to - from + 1) break; } return orders; }
export async function createOrder(order: NewOrder) {
  const { order_items = [], ...orderFields } = order;
  const payload = {
    p_user_id: orderFields.user_id,
    p_payment_method: orderFields.payment_method,
    p_payment_status: orderFields.payment_status,
    p_status: orderFields.status,
    p_pickup_code: orderFields.pickup_code ?? null,
    p_estimated_minutes: orderFields.estimated_minutes ?? null,
    p_payment_reference: orderFields.payment_reference ?? null,
    p_items: order_items.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
    p_notes: orderFields.notes ?? null,
    p_request_id: crypto.randomUUID(),
  };
  const data = await withRetry(async () => {
    const { data, error } = await requireSupabaseClient().rpc('create_order_tx', payload);
    if (error) {
      const message = getErrorMessage(error, 'No se pudo crear el pedido.');
      if (/product_blocked_by_parent/i.test(message)) throw new Error('Este alimento fue bloqueado por tu representante.');
      if (/blocked_ingredient_in_product/i.test(message)) throw new Error('Este alimento contiene un ingrediente bloqueado en tus preferencias o por tu representante.');
      if (/food_ingredients_unverified/i.test(message)) throw new Error('No se puede confirmar este pedido porque la cafetería aún no verificó la lista de ingredientes de este alimento y tienes ingredientes bloqueados. Consulta con la cafetería.');
      throw error;
    }
    return data;
  });
  return String(data);
}
export async function updateOrder(id: string, updates: Partial<Order>) { const { data, error } = await requireSupabaseClient().from('orders').update(updates).eq('id', id).select('*, order_items(*, product:products(*)), user:profiles(*)').single(); if (error) throw error; return data as Order; }
export async function archiveOrders(ids: string[]) { if (!ids.length) return 0; const { data, error } = await requireSupabaseClient().from('orders').update({ admin_hidden: true }).in('id', ids).select('id'); if (error) throw error; return data?.length ?? 0; }
export async function resetOrdersForNewPeriod() { const { data, error } = await requireSupabaseClient().rpc('reset_all_orders'); if (error) throw error; return Number(data ?? 0); }
export async function updateOrderStatus(id: string, status: Order['status']) { const supabase = requireSupabaseClient(); const { data: updatedOrderId, error: rpcError } = await supabase.rpc('admin_update_order_status', { p_order_id: id, p_status: status }); if (!rpcError) return getOrderById(String(updatedOrderId ?? id)); if (!isMissingRpc(rpcError)) throw orderStatusRpcError(rpcError); const { data, error } = await supabase.from('orders').update({ status }).eq('id', id).select('*, order_items(*, product:products(*)), user:profiles(*)').single(); if (error) throw orderStatusRpcError(error); return data as Order; }
export async function moderateOrderPayment(id: string, action: 'approve' | 'reject') {
  const { data, error } = await requireSupabaseClient().rpc('admin_moderate_order_payment', {
    p_order_id: id,
    p_action: action,
  });
  if (error) throw paymentModerationError(error);

  const updatedOrder = Array.isArray(data) ? data[0] : data;
  if (!updatedOrder || typeof updatedOrder !== 'object') {
    throw new Error('La base de datos no devolvió el pedido actualizado después de revisar el pago.');
  }
  return updatedOrder as Order;
}
export async function setManagedUserActive(userId: string, active: boolean) {
  const client = requireSupabaseClient();
  const { error } = await client.rpc('admin_set_user_active', { p_user_id: userId, p_active: active });
  if (error) {
    const message = getErrorMessage(error, 'No se pudo cambiar el estado del usuario.');
    if (/not_authorized/i.test(message)) throw new Error('No tienes permisos de administrador para gestionar usuarios.');
    if (/cannot_change_own_active_status/i.test(message)) throw new Error('No puedes cambiar tu propio estado.');
    if (/protected_account_cannot_be_deactivated/i.test(message)) throw new Error('Esta cuenta administrativa está protegida.');
    if (/user_not_found/i.test(message)) throw new Error('Usuario no encontrado.');
    throw new Error(message);
  }
  const { data: saved, error: verifyError } = await client.from('profiles').select('id,active').eq('id', userId).maybeSingle();
  if (verifyError) throw new Error('El estado de la cuenta se actualizó, pero no se pudo verificar su lectura: ' + verifyError.message);
  if (!saved || saved.active !== active) throw new Error('El estado guardado de la cuenta no coincide con el solicitado.');
}

export async function listUserNotifications(userId: string, limit = 30) { const { data, error } = await requireSupabaseClient().from('notifications').select('id,user_id,order_id,type,title,body,read_at,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(Math.min(Math.max(limit, 1), 100)); if (error) throw error; return (data ?? []) as UserNotification[]; }
export async function markUserNotificationsRead(notificationIds?: string[]) { const { error } = await requireSupabaseClient().rpc('mark_notifications_read', { p_notification_ids: notificationIds?.length ? notificationIds : null }); if (error) throw error; }
export async function getLoyaltySettings() { const { data, error } = await requireSupabaseClient().from('loyalty_settings').select('id,enabled,points_per_currency_unit,updated_at').eq('id', true).single(); if (error) throw error; return data as LoyaltySettings; }
export async function updateLoyaltySettings(updates: Pick<LoyaltySettings, 'enabled'>) { const { data, error } = await requireSupabaseClient().from('loyalty_settings').update(updates).eq('id', true).select('id,enabled,points_per_currency_unit,updated_at').single(); if (error) throw error; return data as LoyaltySettings; }
export async function listLoyaltyRewards(includeInactive = false) { let query = requireSupabaseClient().from('loyalty_rewards').select('*, product:products(*)').order('points_required', { ascending: true }); if (!includeInactive) query = query.eq('active', true); const { data, error } = await query; if (error) throw error; return (data ?? []) as LoyaltyReward[]; }
export async function createLoyaltyReward(reward: LoyaltyRewardInput) { const { data, error } = await requireSupabaseClient().from('loyalty_rewards').insert({ ...reward, points_cost: reward.points_required }).select('*, product:products(*)').single(); if (error) throw error; return data as LoyaltyReward; }
export async function updateLoyaltyReward(id: string, updates: LoyaltyRewardUpdate) { const payload = { ...updates, ...(updates.points_required !== undefined ? { points_cost: updates.points_required } : {}) }; const { data, error } = await requireSupabaseClient().from('loyalty_rewards').update(payload).eq('id', id).select('*, product:products(*)').single(); if (error) throw error; return data as LoyaltyReward; }
export async function listUserLoyaltyRedemptions(userId: string) { const { data, error } = await requireSupabaseClient().from('loyalty_redemptions').select('*, reward:loyalty_rewards(id,title,product:products(name))').eq('user_id', userId).order('created_at', { ascending: false }).limit(20); if (error) throw error; return (data ?? []) as LoyaltyRedemption[]; }
export async function getUserLoyaltyPoints(userId: string) { const { data, error } = await requireSupabaseClient().from('loyalty_point_ledger').select('points').eq('user_id', userId); if (error) throw error; return (data ?? []).reduce((sum, row) => sum + Number(row.points ?? 0), 0); }
export async function redeemLoyaltyReward(rewardId: string): Promise<Omit<LoyaltyRedemption, 'user_id' | 'product_id'> & { verified: boolean; verificationMessage?: string }> {
  const client = requireSupabaseClient();
  const { data, error } = await client.rpc('redeem_loyalty_reward', { p_reward_id: rewardId });
  if (error) throw loyaltyRpcError(error);
  const redemption = data as Omit<LoyaltyRedemption, 'user_id' | 'product_id'> | null;
  if (!redemption?.id) {
    return {
      ...(redemption ?? {} as Omit<LoyaltyRedemption, 'user_id' | 'product_id'>),
      verified: false,
      verificationMessage: 'Supabase no devolvió el identificador del canje.',
    };
  }
  try {
    const { data: saved, error: verifyError } = await client
      .from('loyalty_redemptions')
      .select('id,reward_id,points_spent,redemption_code,status,created_at')
      .eq('id', redemption.id)
      .maybeSingle();
    if (verifyError) throw verifyError;
    if (!saved || saved.id !== redemption.id || saved.reward_id !== rewardId ||
        Number(saved.points_spent) !== Number(redemption.points_spent) ||
        saved.redemption_code !== redemption.redemption_code || saved.status !== redemption.status ||
        saved.status !== 'pending') {
      return {
        ...redemption,
        verified: false,
        verificationMessage: 'El canje no apareció en Supabase o sus datos no coinciden con la respuesta de la transacción.',
      };
    }
    return { ...redemption, verified: true };
  } catch (verificationError) {
    return {
      ...redemption,
      verified: false,
      verificationMessage: `El canje pudo guardarse, pero no se pudo comprobar su lectura: ${getErrorMessage(verificationError, 'error de lectura')}`,
    };
  }
}
export async function listAdminLoyaltyRedemptions(limit = 50) { const { data, error } = await requireSupabaseClient().from('loyalty_redemptions').select('*, user:profiles(id,full_name,email), reward:loyalty_rewards(id,title)').order('created_at', { ascending: false }).limit(Math.min(Math.max(limit, 1), 100)); if (error) throw error; return (data ?? []) as AdminLoyaltyRedemption[]; }
export async function fulfillLoyaltyRedemption(redemptionId: string, redemptionCode: string) { const { error } = await requireSupabaseClient().rpc('admin_fulfill_loyalty_redemption', { p_redemption_id: redemptionId, p_redemption_code: redemptionCode }); if (error) throw loyaltyFulfillmentError(error); }
export async function deleteOrder(id: string) { const client = requireSupabaseClient(); const { error } = await client.from('orders').delete().eq('id', id); if (error) throw error; const [orderCheck, itemsCheck] = await Promise.all([client.from('orders').select('id').eq('id', id).maybeSingle(), client.from('order_items').select('id').eq('order_id', id).limit(1)]); if (orderCheck.error) throw new Error('El pedido se eliminó, pero no se pudo verificar su ausencia: ' + orderCheck.error.message); if (itemsCheck.error) throw new Error('El pedido se eliminó, pero no se pudo verificar la eliminación de sus ítems: ' + itemsCheck.error.message); if (orderCheck.data || (itemsCheck.data ?? []).length) throw new Error('El pedido o alguno de sus ítems todavía aparece en Supabase.'); }
export async function listProfiles() { const supabase = requireSupabaseClient(); const { data, error } = await supabase.rpc('admin_list_users_with_academics'); if (!error) return (data ?? []) as Profile[]; if (!isMissingRpc(error)) throw error; const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id,email,full_name,role,ti,created_at,active,grade,section_id,grade_id,course_id').order('created_at', { ascending: false }); if (profilesError) throw profilesError; return (profiles ?? []) as Profile[]; }
export async function getProfile(userId: string) { return withRetry(async () => { const { data, error } = await requireSupabaseClient().from('profiles').select('id,email,full_name,role,ti,created_at,active,grade,section_id,grade_id,course_id').eq('id', userId).maybeSingle(); if (error) throw error; return data as Profile | null; }); }
export async function createManagedUser(user: NewManagedUser) { const { data, error } = await requireSupabaseClient().rpc('admin_create_user', { p_email: user.email, p_password: user.password, p_full_name: user.full_name, p_role: user.role, p_ti: user.ti ?? null }); if (error) throw error; return String(data); }
export async function updateManagedUser(user: ManagedUserUpdate) { const supabase = requireSupabaseClient(); const payload = { p_user_id: user.id, p_email: user.email, p_full_name: user.full_name, p_role: user.role, p_ti: user.ti ?? null, p_password: user.password?.trim() || null }; const { error } = await supabase.rpc('admin_update_user', payload); if (!error) return; if (isMissingRpc(error) && !payload.p_password) { const { error: legacyError } = await supabase.rpc('admin_update_user', { p_user_id: user.id, p_email: user.email, p_full_name: user.full_name, p_role: user.role, p_ti: user.ti ?? null }); if (!legacyError) return; throw legacyError; } if (isMissingRpc(error) && payload.p_password) throw new Error('Falta aplicar la migración de contraseñas de administrador en Supabase.'); const message = getErrorMessage(error, 'No se pudo actualizar el usuario.'); if (/not_authorized/i.test(message)) throw new Error('Tu sesión no tiene permisos de administrador para modificar usuarios.'); if (/invalid_role/i.test(message)) throw new Error('Selecciona un rol válido: estudiante, admin o admin y estudiante.'); if (/ti_required/i.test(message)) throw new Error('La T.I. es obligatoria cuando el rol es estudiante.'); if (/ti_already_registered/i.test(message)) throw new Error('Esa T.I. ya está asignada a otra cuenta.'); if (/email_already_registered/i.test(message)) throw new Error('Ese correo ya está registrado en otra cuenta.'); if (/password_too_short/i.test(message)) throw new Error('La nueva contraseña debe tener al menos 6 caracteres.'); if (/protected_account/i.test(message)) throw new Error('Las cuentas protegidas solo permiten cambiar correo y contraseña desde el botón de llave.'); throw new Error(message); }
export async function updateProtectedAdminCredentials(user: ProtectedCredentialsUpdate) { const { error } = await requireSupabaseClient().rpc('admin_update_protected_credentials', { p_user_id: user.id, p_email: user.email.trim().toLowerCase(), p_password: user.password?.trim() || null }); if (!error) return; const message = getErrorMessage(error, 'No se pudieron actualizar las credenciales de la cuenta protegida.'); if (/not_authorized/i.test(message)) throw new Error('Solo una cuenta con rol admin o both puede cambiar estas credenciales.'); if (/cannot_change_own_protected_credentials/i.test(message)) throw new Error('Por seguridad, otro administrador debe cambiar las credenciales de su propia cuenta protegida.'); if (/protected_account_not_found/i.test(message)) throw new Error('La cuenta ya no está registrada como protegida. Actualiza la página e inténtalo de nuevo.'); if (/email_already_registered/i.test(message)) throw new Error('Ese correo ya está registrado en otra cuenta.'); if (/password_too_short/i.test(message)) throw new Error('La nueva contraseña debe tener al menos 6 caracteres.'); throw new Error(message); }
export async function deleteManagedUser(id: string) { const client = requireSupabaseClient(); const { error } = await client.rpc('admin_delete_user', { p_user_id: id }); if (error) { const message = getErrorMessage(error, 'No se pudo eliminar el usuario.'); if (/protected_admin|protected_account/i.test(message)) throw new Error('Esta cuenta está protegida y no se puede modificar ni eliminar.'); if (/cannot_delete_self/i.test(message)) throw new Error('No puedes eliminar tu propia cuenta desde el panel.'); if (/foreign key|violates.*constraint|database error deleting user/i.test(message)) throw new Error('No se pudo eliminar el usuario por datos relacionados. Inténtalo de nuevo; la cuenta protegida no se eliminará.'); throw error; } const { data: remaining, error: verifyError } = await client.from('profiles').select('id').eq('id', id).maybeSingle(); if (verifyError) throw new Error('La eliminación se ejecutó, pero no se pudo verificar la ausencia de la cuenta: ' + verifyError.message); if (remaining) throw new Error('La cuenta todavía tiene un perfil en Supabase; no se confirmó la eliminación.'); }
export async function listProtectedAdminEmails() { const { data, error } = await requireSupabaseClient().rpc('list_protected_admin_emails'); if (error) throw error; return ((data ?? []) as Array<{ email?: string | null }>).map((row) => typeof row?.email === 'string' ? row.email.trim().toLowerCase() : '').filter(Boolean); }
export async function getSystemHealthSummary() { const data = await withRetry(async () => { const { data, error } = await requireSupabaseClient().rpc('get_system_health_summary'); if (error) throw error; return data; }); return (data ?? []) as SystemHealthCheck[]; }
export async function writeAudit(entry: { action: string; actor_id?: string; actor_email?: string; entity?: string; entity_id?: string; metadata?: Record<string, unknown> }) { const supabase = requireSupabaseClient(); const { error } = await supabase.rpc('write_system_audit_event', { p_action: entry.action, p_entity_type: entry.entity ?? null, p_entity_id: entry.entity_id ?? null, p_details: entry.metadata ?? {}, p_status: entry.action.endsWith('.error') ? 'failure' : 'success' }); if (!error) return; if (!isMissingRpc(error)) throw error; const { error: legacyError } = await supabase.from('audit_logs').insert({ action: entry.action, actor_id: entry.actor_id, actor_email: entry.actor_email, entity: entry.entity, entity_id: entry.entity_id, metadata: entry.metadata ?? {} }); if (legacyError) throw legacyError; }
