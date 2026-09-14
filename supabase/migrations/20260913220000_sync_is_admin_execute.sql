-- Keep the database migration history in sync with the deployed Supabase permissions.
-- The public/authenticated clients need to be able to invoke the zero-argument
-- is_admin() RPC; the function itself remains responsible for its authorization logic.
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
