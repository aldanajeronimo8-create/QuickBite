-- The limit is configurable, but the product rule caps it at two advance orders per student and recess.
ALTER TABLE public.recess_order_settings
  DROP CONSTRAINT IF EXISTS recess_order_settings_max_preorders_per_student_check;

ALTER TABLE public.recess_order_settings
  ADD CONSTRAINT recess_order_settings_max_preorders_per_student_check
  CHECK (max_preorders_per_student BETWEEN 1 AND 2);

CREATE OR REPLACE FUNCTION public.admin_set_recess_preorder_limit(p_max_preorders integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE v_limit integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_max_preorders IS NULL OR p_max_preorders < 1 OR p_max_preorders > 2 THEN
    RAISE EXCEPTION 'invalid_preorder_limit';
  END IF;

  INSERT INTO public.recess_order_settings(id, max_preorders_per_student, updated_at)
  VALUES (true, p_max_preorders, now())
  ON CONFLICT (id) DO UPDATE
    SET max_preorders_per_student = excluded.max_preorders_per_student,
        updated_at = now()
  RETURNING max_preorders_per_student INTO v_limit;

  PERFORM public.write_system_audit_event(
    'recess.preorder_limit_updated',
    'recess_order_settings',
    'true',
    jsonb_build_object('max_preorders_per_student', v_limit)
  );
  RETURN v_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_recess_preorder_limit(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_recess_preorder_limit(integer) TO authenticated;
