-- Keep the Users panel aligned with Supabase Auth, safely reset every order
-- after an Excel export, and preserve multi-device synchronization.

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(
  id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  ti TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    auth_user.id,
    lower(auth_user.email)::TEXT,
    COALESCE(
      NULLIF(profile.full_name, ''),
      NULLIF(auth_user.raw_user_meta_data ->> 'full_name', ''),
      split_part(auth_user.email, '@', 1)
    )::TEXT,
    COALESCE(
      profile.role,
      CASE auth_user.raw_user_meta_data ->> 'role'
        WHEN 'admin' THEN 'admin'
        WHEN 'both' THEN 'both'
        ELSE 'student'
      END
    )::TEXT,
    profile.ti,
    auth_user.created_at
  FROM auth.users AS auth_user
  LEFT JOIN public.profiles AS profile ON profile.id = auth_user.id
  WHERE auth_user.deleted_at IS NULL
  ORDER BY auth_user.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- Supabase guards deletes without a WHERE clause. These predicates match every
-- row but make the deliberate full-period reset explicit and safe to execute.
CREATE OR REPLACE FUNCTION public.reset_all_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_count INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_order_count FROM public.orders;

  -- Child rows are removed through their ON DELETE CASCADE constraints. Stock
  -- is deliberately untouched because closing a sales period never restocks.
  DELETE FROM public.orders
  WHERE id IS NOT NULL;

  IF to_regclass('public.sales_export_batches') IS NOT NULL THEN
    DELETE FROM public.sales_export_batches
    WHERE id IS NOT NULL;
  END IF;

  RETURN v_order_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_all_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_all_orders() TO authenticated;

-- An account may exist in Auth even if its profile creation was interrupted.
-- Deleting that account from the Users panel must still work, while retaining
-- the explicit protection for the five designated accounts.
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'cannot_delete_self'; END IF;

  SELECT lower(email) INTO v_email
  FROM auth.users
  WHERE id = p_user_id
    AND deleted_at IS NULL;

  IF v_email IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF public.is_protected_admin_email(v_email) THEN
    RAISE EXCEPTION 'protected_account_cannot_be_deleted';
  END IF;

  DELETE FROM public.loyalty_redemptions WHERE user_id = p_user_id;

  IF to_regclass('public.sales_export_batches') IS NOT NULL THEN
    UPDATE public.sales_export_batches
    SET created_by = auth.uid()
    WHERE created_by = p_user_id;
  END IF;

  DELETE FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'profiles', 'categories', 'products', 'orders', 'order_items',
    'notifications', 'loyalty_settings', 'loyalty_rewards', 'loyalty_redemptions'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;
