-- The one-time password hash phase already has to be proven by the service-only
-- marker. During phase 2, Auth may rewrite ancillary app_metadata keys; only permit
-- the tightly constrained pending -> activated transition with the hash unchanged.
DO $patch$
DECLARE
  v_definition text;
  v_segment text := $segment$      AND (
        COALESCE(OLD.raw_app_meta_data, '{}'::jsonb)
          - ARRAY['quickbite_must_change_password', 'quickbite_first_password_changed_at']
      ) IS NOT DISTINCT FROM (
        COALESCE(NEW.raw_app_meta_data, '{}'::jsonb)
          - ARRAY['quickbite_must_change_password', 'quickbite_first_password_changed_at']
      )
$segment$;
BEGIN
  SELECT pg_get_functiondef('public.prevent_protected_admin_auth_change()'::regprocedure)
    INTO v_definition;
  IF strpos(v_definition, v_segment) = 0 THEN
    RAISE EXCEPTION 'Expected metadata comparison was not found; trigger left unchanged';
  END IF;
  v_definition := replace(v_definition, v_segment, '');
  EXECUTE v_definition;
END;
$patch$;
