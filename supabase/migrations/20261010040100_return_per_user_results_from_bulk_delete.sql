DROP FUNCTION IF EXISTS public.admin_delete_users(uuid[]);
CREATE FUNCTION public.admin_delete_users(p_user_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_user_id uuid;
  v_ids uuid[];
  v_deleted_ids uuid[] := ARRAY[]::uuid[];
  v_deleted integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_failures jsonb := '[]'::jsonb;
  v_email text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT array_agg(DISTINCT user_id ORDER BY user_id) INTO v_ids
  FROM unnest(COALESCE(p_user_ids, ARRAY[]::uuid[])) AS selected(user_id)
  WHERE user_id IS NOT NULL;
  IF COALESCE(cardinality(v_ids), 0) = 0 THEN
    RETURN jsonb_build_object('deleted_count',0,'skipped_count',0,'failed_count',0,'deleted_ids','[]'::jsonb,'failures','[]'::jsonb);
  END IF;
  IF cardinality(v_ids) > 100 THEN RAISE EXCEPTION 'bulk_delete_limit_exceeded'; END IF;
  FOREACH v_user_id IN ARRAY v_ids LOOP
    BEGIN
      IF v_user_id = auth.uid() THEN
        v_skipped := v_skipped + 1;
        v_failures := v_failures || jsonb_build_array(jsonb_build_object('user_id',v_user_id,'error','cannot_delete_self'));
        CONTINUE;
      END IF;
      SELECT lower(COALESCE(au.email,p.email,'')) INTO v_email
      FROM (SELECT v_user_id AS id) selected
      LEFT JOIN auth.users au ON au.id=selected.id AND au.deleted_at IS NULL
      LEFT JOIN public.profiles p ON p.id=selected.id;
      IF COALESCE(v_email,'')='' THEN
        v_skipped := v_skipped + 1;
        v_failures := v_failures || jsonb_build_array(jsonb_build_object('user_id',v_user_id,'error','user_not_found'));
        CONTINUE;
      END IF;
      IF public.is_protected_admin_email(v_email) THEN
        v_skipped := v_skipped + 1;
        v_failures := v_failures || jsonb_build_array(jsonb_build_object('user_id',v_user_id,'error','protected_account_cannot_be_deleted'));
        CONTINUE;
      END IF;
      PERFORM public.admin_delete_user(v_user_id);
      v_deleted := v_deleted + 1;
      v_deleted_ids := array_append(v_deleted_ids,v_user_id);
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_failures := v_failures || jsonb_build_array(jsonb_build_object('user_id',v_user_id,'error',SQLERRM));
    END;
  END LOOP;
  RETURN jsonb_build_object('deleted_count',v_deleted,'skipped_count',v_skipped,'failed_count',v_failed,'deleted_ids',to_jsonb(v_deleted_ids),'failures',v_failures);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_delete_users(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_users(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_users(uuid[]) TO service_role;
