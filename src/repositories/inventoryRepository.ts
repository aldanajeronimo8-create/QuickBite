import { requireSupabaseClient } from '../lib/supabase';

export type InventoryMovementType = 'entry' | 'sale' | 'reservation' | 'release' | 'return' | 'adjustment';

export interface InventoryMovement {
  id: string;
  product_id: string;
  movement_type: InventoryMovementType;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  user_id: string | null;
  reason: string | null;
  created_at: string;
  product?: { name: string; image_url?: string | null } | null;
  user?: { full_name: string; email: string } | null;
}

export async function adjustInventory(
  productId: string,
  newStock: number,
  movementType: InventoryMovementType,
  reason?: string,
) {
  const { data, error } = await requireSupabaseClient().rpc('admin_adjust_inventory', {
    p_product_id: productId,
    p_new_stock: newStock,
    p_movement_type: movementType,
    p_reason: reason ?? null,
  });

  if (error) {
    const message = error.message ?? String(error);
    if (/not_authorized/i.test(message)) throw new Error('No tienes permisos de administrador para modificar inventario.');
    if (/invalid_stock/i.test(message)) throw new Error('El stock debe ser un número mayor o igual que 0.');
    if (/stock_unchanged/i.test(message)) throw new Error('El nuevo stock es igual al stock actual.');
    if (/movement_direction_invalid/i.test(message)) throw new Error('El tipo de movimiento no coincide con la dirección del cambio de stock.');
    if (/reason_required/i.test(message)) throw new Error('Escribe un motivo para el ajuste de inventario.');
    throw error;
  }

  return String(data);
}

export async function listInventoryMovements(limit = 100) {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const { data, error } = await requireSupabaseClient()
    .from('inventory_movements')
    .select('id,product_id,movement_type,quantity,previous_stock,new_stock,user_id,reason,created_at,product:products(name,image_url),user:profiles(full_name,email)')
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return (data ?? []) as unknown as InventoryMovement[];
}
