-- Restore the five protected accounts as combined accounts: they can use both
-- the student menu and the administration panel, while remaining immutable.

CREATE OR REPLACE FUNCTION public.prevent_protected_admin_profile_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.allow_protected_admin_maintenance', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF public.is_protected_admin_email(OLD.email) THEN
    RAISE EXCEPTION 'protected_account_cannot_be_changed';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_protected_admin_auth_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF current_setting('app.allow_protected_admin_maintenance', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF public.is_protected_admin_email(OLD.email) THEN
    RAISE EXCEPTION 'protected_account_cannot_be_changed';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Keep completed sales as accounting history when an account is deleted. The
-- customer reference becomes NULL instead of preventing the account deletion.
ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints AS tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'orders'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND tc.constraint_name IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.orders'::regclass
          AND confrelid = 'public.profiles'::regclass
      )
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END;
$$;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$
BEGIN
  -- This setting is restricted to this migration transaction. It permits the
  -- one-time conversion without weakening the protection triggers afterwards.
  PERFORM set_config('app.allow_protected_admin_maintenance', 'true', true);

  UPDATE public.profiles AS profile
  SET role = 'both', updated_at = NOW()
  FROM public.protected_admins AS protected
  WHERE lower(profile.email) = protected.email
    AND profile.role IS DISTINCT FROM 'both';

  UPDATE auth.users AS auth_user
  SET raw_user_meta_data = COALESCE(auth_user.raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', 'both'),
      updated_at = NOW()
  FROM public.protected_admins AS protected
  WHERE lower(auth_user.email) = protected.email;
END;
$$;

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

  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF public.is_protected_admin_email(v_email) THEN
    RAISE EXCEPTION 'protected_account_cannot_be_deleted';
  END IF;

  -- User-specific loyalty data must be removed before the profile can go.
  DELETE FROM public.loyalty_redemptions WHERE user_id = p_user_id;

  -- Retain export audit records if the deleted account was an administrator.
  IF to_regclass('public.sales_export_batches') IS NOT NULL THEN
    UPDATE public.sales_export_batches
    SET created_by = auth.uid()
    WHERE created_by = p_user_id;
  END IF;

  -- Deleting Auth cascades to profiles. Notifications cascade and orders retain
  -- their financial data with a NULL customer reference through the FK above.
  DELETE FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;
