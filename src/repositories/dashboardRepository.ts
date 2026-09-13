import { requireSupabaseClient } from '../lib/supabase';

export type DashboardProductMetric = {
  id: string;
  name: string;
  stock: number;
  available: boolean;
  units_sold: number;
  revenue: number;
  recorded_entries: number;
  avg_daily_units: number;
  risk_level?: 'hidden' | 'critical' | 'high' | 'medium' | 'low';
};

export type DashboardAnalytics = {
  period_days: number;
  summary: { paid_orders: number; revenue: number; avg_ticket: number };
  top_products: DashboardProductMetric[];
  stock_risk: DashboardProductMetric[];
  daily: Array<{ day: string; orders: number; revenue: number }>;
  movement_summary: Array<{ movement_type: string; quantity: number }>;
};

export async function getAdminDashboardIntelligence(days = 30): Promise<DashboardAnalytics> {
  const { data, error } = await requireSupabaseClient().rpc('get_admin_dashboard_intelligence', { p_days: days });
  if (error) throw error;
  return data as DashboardAnalytics;
}
