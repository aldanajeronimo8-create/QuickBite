-- The temporary test-period reset is intentionally available to authenticated users
-- only when the function's own is_admin() guard passes.
REVOKE EXECUTE ON FUNCTION public.reset_all_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_all_orders() TO authenticated;
