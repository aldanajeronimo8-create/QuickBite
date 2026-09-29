-- Keep the legacy admin notification read endpoint harmless during auth transitions.
-- Unauthorized callers cannot mutate any admin notification rows.
CREATE OR REPLACE FUNCTION public.mark_admin_notifications_read(p_section text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, auth
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RETURN 0;
  END IF;

  UPDATE public.admin_notifications
  SET read_at = COALESCE(read_at, NOW())
  WHERE admin_user_id = auth.uid()
    AND read_at IS NULL
    AND (p_section IS NULL OR section = p_section);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
