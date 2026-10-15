-- Restore the administrative reset RPC after routine privilege hardening.
-- The function itself checks auth.uid() and public.is_admin(), so authenticated
-- users can invoke the RPC but only active admin/both/all accounts may proceed.
REVOKE ALL PRIVILEGES ON FUNCTION public.reset_all_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_all_orders() TO authenticated;
