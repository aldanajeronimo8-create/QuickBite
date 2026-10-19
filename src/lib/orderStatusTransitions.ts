import type { Order } from './supabase';

/**
 * Returns only the next step that is allowed by the order lifecycle.
 * Payment approval/rejection happens through its dedicated server-side action.
 */
export function nextAuthorizedOrderStatus(
  status: Order['status'],
  paymentStatus: Order['payment_status'],
): 'preparing' | 'ready' | 'delivered' | null {
  if (paymentStatus !== 'confirmed') return null;
  if (status === 'pending') return 'preparing';
  if (status === 'preparing') return 'ready';
  if (status === 'ready') return 'delivered';
  return null;
}
