import { requireSupabaseClient } from '@/lib/supabaseClient';

export type RecessOrderOption = {
  recess_schedule_id: string;
  name: string;
  start_time: string;
  end_time: string;
  pickup_date: string;
  preorders_count: number;
  max_preorders: number | null;
  is_active: boolean;
  window_open: boolean;
  server_now: string;
};

export type PickupOrderWindow = {
  slot_id: string;
  slot_name: string;
  starts_at: string;
  ends_at: string;
  enabled: boolean;
  max_orders: number | null;
  orders_count: number;
  accepting_orders: boolean;
};

export type StudentOrderSchedule =
  | { mode: 'recess'; recessOptions: RecessOrderOption[]; pickupWindows: [] }
  | { mode: 'pickup'; recessOptions: []; pickupWindows: PickupOrderWindow[] }
  | { mode: 'unrestricted'; recessOptions: []; pickupWindows: [] };

/**
 * Resolves the same order-time priority enforced by create_order_with_recess_tx:
 * section-specific recesses first, general pickup windows only when no recess
 * applies, and unrestricted ordering when the global pickup-window switch is off.
 */
export async function loadStudentOrderSchedule(): Promise<StudentOrderSchedule> {
  const client = requireSupabaseClient();
  const { data: recessData, error: recessError } = await client.rpc('get_student_preorder_options');
  if (recessError) throw recessError;

  const recessOptions = (recessData ?? []) as RecessOrderOption[];
  if (recessOptions.length > 0) {
    return { mode: 'recess', recessOptions, pickupWindows: [] };
  }

  const { data: featureEnabled, error: featureError } = await client.rpc('get_order_windows_enabled');
  if (featureError) throw featureError;

  if (featureEnabled !== true) {
    return { mode: 'unrestricted', recessOptions: [], pickupWindows: [] };
  }

  const { data: windowData, error: windowsError } = await client.rpc('get_order_window_status');
  if (windowsError) throw windowsError;

  return {
    mode: 'pickup',
    recessOptions: [],
    pickupWindows: (windowData ?? []) as PickupOrderWindow[],
  };
}
