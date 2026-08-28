import { createClient } from '@supabase/supabase-js';
import { appConfig, hasSupabaseConfig } from '../config/appConfig';
import type { UserRole } from './access';

export const supabase = hasSupabaseConfig()
  ? createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 10 } },
  })
  : null;

export function requireSupabaseClient() {
  if (!supabase) throw new Error('Supabase no esta configurado. Completa el asistente de primer inicio.');
  return supabase;
}

export interface Profile { id: string; email: string; full_name: string; role: UserRole; ti?: string | null; created_at: string; }
export interface Category { id: string; name: string; description?: string; created_at: string; }
export interface Product { id: string; name: string; description?: string; price: number; image_url?: string; category_id: string; stock: number; available: boolean; created_at: string; category?: Category; }
export interface Order {
  id: string; user_id: string | null; total: number;
  status: 'pending' | 'preparing' | 'ready' | 'delivered';
  payment_method: 'nequi' | 'cash' | 'bre-b';
  payment_status: 'pending' | 'confirmed' | 'rejected';
  order_number: string; created_at: string; admin_hidden?: boolean;
  pickup_code?: string; estimated_minutes?: number; payment_reference?: string;
  notes?: string | null; user?: Profile; order_items?: OrderItem[];
}
export interface OrderItem { id: string; order_id: string; product_id: string; quantity: number; price: number; product?: Product; }
export interface UserNotification { id: string; user_id: string; order_id?: string | null; type: 'order_status' | 'reward_redemption'; title: string; body: string; read_at?: string | null; created_at: string; }
export interface LoyaltySettings { id: boolean; enabled: boolean; points_per_currency_unit: number; updated_at: string; }
export interface LoyaltyReward {
  id: string; product_id: string; title: string; description?: string | null;
  points_required: number; points_cost?: number | null; active: boolean;
  created_at: string; updated_at: string; product?: Product;
}
export type LoyaltyRedemptionStatus = 'pending' | 'reserved' | 'approved' | 'fulfilled' | 'delivered' | 'cancelled';
export interface LoyaltyRedemption { id: string; user_id: string; reward_id: string; product_id: string; points_spent: number; redemption_code: string; status: LoyaltyRedemptionStatus; created_at: string; fulfilled_at?: string | null; reward?: Pick<LoyaltyReward, 'id' | 'title'> & { product?: Pick<Product, 'name'> }; }
export interface AdminLoyaltyRedemption extends LoyaltyRedemption { user?: Pick<Profile, 'id' | 'full_name' | 'email'>; }

export interface SystemHealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency_ms: number | null;
  checked_at: string;
  details: Record<string, unknown>;
}
