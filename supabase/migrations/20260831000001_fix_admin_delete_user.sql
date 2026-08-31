-- QuickBite: make Admin -> Usuarios -> Eliminar remove both the profile and Supabase Auth account.
-- Also cleans profiles left behind by previous failed deletions.

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT;
  v_auth_exists BOOLEAN := false;
  v_profile_exists BOOLEAN := false;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_delete_self';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user_id
  ) INTO v_profile_exists;

  SELECT lower(email)
    INTO v_email
  FROM auth.users
  WHERE id = p_user_id
    AND deleted_at IS NULL;

  IF v_email IS NOT NULL THEN
    v_auth_exists := true;
  ELSIF v_profile_exists THEN
    SELECT lower(email) INTO v_email FROM public.profiles WHERE id = p_user_id;
  ELSE
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF v_email IS NOT NULL AND public.is_protected_admin_email(v_email) THEN
    RAISE EXCEPTION 'protected_account_cannot_be_deleted';
  END IF;

  -- Keep historical orders, but remove the deleted user's personal reference.
  UPDATE public.orders SET user_id = NULL WHERE user_id = p_user_id;

  -- Keep audit history without pointing to a deleted actor.
  UPDATE public.audit_logs SET actor_id = NULL WHERE actor_id = p_user_id;
  UPDATE public.system_audit_logs SET actor_user_id = NULL WHERE actor_user_id = p_user_id;

  -- Do not block deletion through a reviewer foreign key.
  UPDATE public.wallet_topup_requests SET reviewed_by = NULL WHERE reviewed_by = p_user_id;

  -- User-owned records that would otherwise restrict profile deletion.
  DELETE FROM public.loyalty_redemptions WHERE user_id = p_user_id;
  DELETE FROM public.student_data_consents WHERE user_id = p_user_id;

  -- CASCADE relationships from profiles clean up favorites, wallet, family links, etc.
  DELETE FROM public.profiles WHERE id = p_user_id;

  -- Delete the actual Supabase Auth account. Auth-owned child rows cascade automatically.
  IF v_auth_exists THEN
    DELETE FROM auth.users WHERE id = p_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'user_not_found';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;

-- Remove profile rows left behind when the previous implementation failed during auth.users deletion.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.id
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE u.id IS NULL
  LOOP
    UPDATE public.audit_logs SET actor_id = NULL WHERE actor_id = r.id;
    UPDATE public.system_audit_logs SET actor_user_id = NULL WHERE actor_user_id = r.id;
    UPDATE public.wallet_topup_requests SET reviewed_by = NULL WHERE reviewed_by = r.id;
    DELETE FROM public.loyalty_redemptions WHERE user_id = r.id;
    DELETE FROM public.student_data_consents WHERE user_id = r.id;
    DELETE FROM public.profiles WHERE id = r.id;
  END LOOP;
END $$;
