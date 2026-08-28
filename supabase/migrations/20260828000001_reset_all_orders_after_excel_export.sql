-- A period close is performed only after the browser has generated the Excel
-- report. It must reset every operational order, including previously hidden
-- orders, while leaving products and their current stock untouched.

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

  -- order_items and notifications are removed by their ON DELETE CASCADE
  -- constraints. No product row is updated here, so stock is preserved.
  DELETE FROM public.orders;

  -- Export batches only contain JSON references to the just-exported orders;
  -- clearing them prevents stale operational-period state from remaining.
  IF to_regclass('public.sales_export_batches') IS NOT NULL THEN
    DELETE FROM public.sales_export_batches;
  END IF;

  RETURN v_order_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_all_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_all_orders() TO authenticated;
