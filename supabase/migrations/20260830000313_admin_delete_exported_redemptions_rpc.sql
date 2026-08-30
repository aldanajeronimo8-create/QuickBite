CREATE OR REPLACE FUNCTION public.admin_delete_exported_redemptions(p_redemption_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  DELETE FROM public.loyalty_redemptions
  WHERE id = ANY(COALESCE(p_redemption_ids, '{}'::uuid[]));

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_exported_redemptions(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_exported_redemptions(uuid[]) TO authenticated;
