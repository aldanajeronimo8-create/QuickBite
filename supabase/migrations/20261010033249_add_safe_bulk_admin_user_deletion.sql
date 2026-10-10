CREATE OR REPLACE FUNCTION public.admin_delete_users(p_user_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_user_id uuid;
  v_count integer := 0;
  v_ids uuid[];
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT array_agg(DISTINCT user_id ORDER BY user_id)
    INTO v_ids
  FROM unnest(COALESCE(p_user_ids, ARRAY[]::uuid[])) AS selected(user_id)
  WHERE user_id IS NOT NULL;

  IF COALESCE(cardinality(v_ids), 0) = 0 THEN
    RETURN 0;
  END IF;

  IF cardinality(v_ids) > 500 THEN
    RAISE EXCEPTION 'bulk_delete_limit_exceeded';
  END IF;

  IF auth.uid() = ANY(v_ids) THEN
    RAISE EXCEPTION 'cannot_delete_self';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_ids) AS selected(user_id)
    LEFT JOIN auth.users au ON au.id = selected.user_id AND au.deleted_at IS NULL
    LEFT JOIN public.profiles p ON p.id = selected.user_id
    WHERE public.is_protected_admin_email(COALESCE(au.email, p.email, ''))
  ) THEN
    RAISE EXCEPTION 'protected_account_cannot_be_deleted';
  END IF;

  -- One RPC/transaction handles the whole selection. Reuse the existing
  -- hardened deletion routine so all current FK cleanup and safeguards remain.
  FOREACH v_user_id IN ARRAY v_ids LOOP
    PERFORM public.admin_delete_user(v_user_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delete_users(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_users(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_users(uuid[]) TO service_role;
