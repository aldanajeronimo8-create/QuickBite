import { createClient } from '@supabase/supabase-js';
import { appConfig, hasSupabaseConfig } from '../config/appConfig';

export const supabase = hasSupabaseConfig()
  ? createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  : null;

export function requireSupabaseClient() {
  if (!supabase) {
    throw new Error('Supabase no esta configurado. Completa el asistente de primer inicio.');
  }
  return supabase;
}

export type UserRole = 'admin' | 'student' | 'both';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  ti?: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  category_id: string;
  stock: number;
  available: boolean;
  created_at: string;
  category?: Category;
}

export interface Order {
  id: string;
  user_id: string;
  total: number;
  status: 'pending' | 'preparing' | 'ready' | 'delivered';
  payment_method: 'nequi' | 'bancolombia' | 'daviplata' | 'bre-b' | 'bank_keys' | 'cash';
  payment_status: 'pending' | 'confirmed' | 'rejected';
  order_number: string;
  created_at: string;
  admin_hidden?: boolean;
  pickup_code?: string;
  estimated_minutes?: number;
  payment_reference?: string;
  user?: Profile;
  order_items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  price: number;
  product?: Product;
}

export interface LoyaltySettings {
  id: boolean;
  enabled: boolean;
  points_per_amount: number;
  currency_amount: number;
  updated_at: string;
}

export interface LoyaltyReward {
  id: string;
  title: string;
  description?: string | null;
  points_cost: number;
  active: boolean;
  stock?: number | null;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyRedemption {
  id: string;
  user_id: string;
  reward_id: string;
  points_spent: number;
  status: 'pending' | 'approved' | 'delivered' | 'cancelled';
  created_at: string;
  reward?: LoyaltyReward;
}
