-- Restore authenticated execution for RPCs used by the real application UI.
-- Admin system RPCs are only requested by the admin workspace and must retain
-- their internal admin authorization checks.
-- Order creation must enforce auth.uid() and validate product/stock transactionally.
-- Parent registration completion must retain its own pending-registration checks.
GRANT EXECUTE ON FUNCTION public.create_order_tx(uuid, text, text, text, text, integer, text, jsonb, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_system_operational_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_admin_health_check() TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_pending_parent_registration() TO authenticated;
