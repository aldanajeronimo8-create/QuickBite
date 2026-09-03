import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { appConfig, hasSupabaseConfig } from '../config/appConfig';
import type { UserRole } from './access';

export type AuthContext = 'admin' | 'user';

const AUTH_CONTEXT_STORAGE_KEY = 'quickbite.auth.context';
const ACTIVE_STUDENT_STORAGE_KEY = 'quickbite.parent.activeStudent';
const USER_AUTH_STORAGE_KEY = 'quickbite.user.auth';
const ADMIN_AUTH_STORAGE_KEY = 'quickbite.admin.auth';

function getTabStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.sessionStorage;
}

function createAuthClient(storageKey: string) {
  if (!hasSupabaseConfig()) return null;
  return createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
    auth: {
      // Keep the session persistent across reloads in the same tab, but do not
      // synchronize auth state through shared localStorage across other tabs.
      // This allows admin/student/parent accounts to stay signed in separately
      // when the same browser has multiple QuickBite sessions open.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey,
      storage: getTabStorage(),
    },
    realtime: { params: { eventsPerSecond: 10 } },
  });
}

export const supabase = createAuthClient(USER_AUTH_STORAGE_KEY);
export const adminSupabase = createAuthClient(ADMIN_AUTH_STORAGE_KEY);

export function setAuthContext(context: AuthContext) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(AUTH_CONTEXT_STORAGE_KEY, context);
}

export function getAuthContext(): AuthContext {
  if (typeof window === 'undefined') return 'user';
  const stored = window.sessionStorage.getItem(AUTH_CONTEXT_STORAGE_KEY) === 'admin' ? 'admin' : 'user';
  if (window.location.pathname.startsWith('/admin')) return 'admin';
  return stored;
}

export function getSupabaseClientForContext(context: AuthContext): SupabaseClient | null {
  return context === 'admin' ? adminSupabase : supabase;
}

type StoredActingStudent = { id: string; full_name: string; email: string; grade: string | null; ti: string | null };

function getActiveStudent(): StoredActingStudent | null {
  if (typeof window === 'undefined') return null;
  try {
    // The active delegated student must also be tab-scoped; localStorage would
    // make switching a parent session in one tab change another tab's student.
    const raw = window.sessionStorage.getItem(ACTIVE_STUDENT_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredActingStudent>;
    if (!value.id || !value.full_name || !value.email) return null;
    return { id: value.id, full_name: value.full_name, email: value.email, grade: value.grade ?? null, ti: value.ti ?? null };
  } catch {
    return null;
  }
}

function actingAuthProxy<T extends SupabaseClient['auth']>(auth: T): T {
  return new Proxy(auth, {
    get(target, property, receiver) {
      if (property === 'getSession') {
        return async () => {
          const result = await target.getSession();
          const acting = getActiveStudent();
          if (!acting || !result.data.session) return result;
          return { ...result, data: { ...result.data, session: { ...result.data.session, user: { ...result.data.session.user, id: acting.id, email: acting.email, user_metadata: { ...result.data.session.user.user_metadata, full_name: acting.full_name, acting_as_student: true } } } } };
        };
      }
      if (property === 'getUser') {
        return async () => {
          const result = await target.getUser();
          const acting = getActiveStudent();
          if (!acting || !result.data.user) return result;
          return { ...result, data: { ...result.data, user: { ...result.data.user, id: acting.id, email: acting.email, user_metadata: { ...result.data.user.user_metadata, full_name: acting.full_name, acting_as_student: true } } } };
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as T;
}

function createUserProxy(client: SupabaseClient): SupabaseClient {
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === 'auth') return actingAuthProxy(target.auth);
      if (property === 'rpc') {
        return (functionName: string, args?: Record<string, unknown>, options?: unknown) => {
          const acting = getActiveStudent();
          const nextArgs = { ...(args ?? {}) };
          if (acting && functionName === 'request_wallet_topup') nextArgs.p_user_id = acting.id;
          if (acting && functionName === 'redeem_loyalty_reward') nextArgs.p_user_id = acting.id;
          if (acting && functionName === 'get_or_create_student_code') nextArgs.p_student_user_id = acting.id;
          if (acting && functionName === 'mark_notifications_read') nextArgs.p_user_id = acting.id;
          return target.rpc(functionName, nextArgs, options as never);
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

let proxiedUserClient: SupabaseClient | null = null;

export function requireSupabaseClient() {
  const context = getAuthContext();
  const client = getSupabaseClientForContext(context);
  if (!client) throw new Error('Supabase no esta configurado. Completa el asistente de primer inicio.');
  if (context === 'admin') return client;
  if (!proxiedUserClient) proxiedUserClient = createUserProxy(client);
  return proxiedUserClient;
}

export interface Profile { id: string; email: string; full_name: string; role: UserRole; ti?: string | null; created_at: string; }
export interface Category { id: string; name: string; description?: string; created_at: string; }
export interface Product { id: string; name: string; description?: string; price: number; image_url?: string; category_id: string; stock: number; available: boolean; created_at: string; category?: Category; }
export interface Order { id: string; user_id: string | null; total: number; status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'rejected' | 'cancelled'; payment_method: 'nequi' | 'cash' | 'bre-b' | 'credits'; payment_status: 'pending' | 'confirmed' | 'rejected'; order_number: string; created_at: string; admin_hidden?: boolean; pickup_code?: string; estimated_minutes?: number; payment_reference?: string; notes?: string | null; student_comment?: string | null; user?: Profile; order_items?: OrderItem[]; }
export interface OrderItem { id: string; order_id: string; product_id: string; quantity: number; price: number; product?: Product; }
export interface UserNotification { id: string; user_id: string; order_id?: string | null; type: 'order_status' | 'reward_redemption'; title: string; body: string; read_at?: string | null; created_at: string; }
export interface LoyaltySettings { id: boolean; enabled: boolean; points_per_currency_unit: number; updated_at: string; }
export interface LoyaltyReward { id: string; product_id: string; title: string; description?: string | null; points_required: number; points_cost?: number | null; active: boolean; created_at: string; updated_at: string; product?: Pick<Product, 'name' | 'image_url'>; }
export type LoyaltyRedemptionStatus = 'pending' | 'reserved' | 'approved' | 'fulfilled' | 'delivered' | 'cancelled';
export interface LoyaltyRedemption { id: string; user_id: string; reward_id: string; product_id: string; points_spent: number; redemption_code: string; status: LoyaltyRedemptionStatus; created_at: string; admin_hidden?: boolean; fulfilled_at?: string | null; reward?: Pick<LoyaltyReward, 'id' | 'title'> & { product?: Pick<Product, 'name'> }; }
export interface AdminLoyaltyRedemption extends LoyaltyRedemption { user?: Pick<Profile, 'id' | 'full_name' | 'email'>; }

export interface SystemHealthCheck { service: string; status: 'healthy' | 'degraded' | 'unhealthy'; latency_ms: number | null; checked_at: string; details: Record<string, unknown>; }