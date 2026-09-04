-- Keep the administrative wallet approval RPC available to signed-in admins only.
-- The function already validates auth.uid() + public.is_admin(); this removes
-- unnecessary anonymous EXECUTE exposure without changing the application flow.
REVOKE EXECUTE ON FUNCTION public.admin_approve_wallet_topup(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_wallet_topup(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
