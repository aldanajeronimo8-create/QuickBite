-- Permanently clear only orders and their line items. This is intentionally
-- restricted to admin/both accounts and does not touch products, profiles or loyalty data.

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
  DELETE FROM public.order_items
  WHERE order_id IN (SELECT id FROM public.orders);
  DELETE FROM public.orders;

  RETURN v_order_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_all_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_all_orders() TO authenticated;
