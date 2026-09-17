BEGIN;

DROP POLICY IF EXISTS audit_logs_select_authenticated ON public.audit_logs;
DROP POLICY IF EXISTS pickup_slots_select_authenticated ON public.pickup_slots;

REVOKE EXECUTE ON FUNCTION public.run_quickbite_automations() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_daily_summary(date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_order_status(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_exported_redemptions(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_product_availability() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_loyalty_reward_points_cost() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

COMMIT;
