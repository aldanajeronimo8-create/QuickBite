CREATE OR REPLACE FUNCTION public.reset_all_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_order_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT COUNT(*)::integer INTO v_order_count FROM public.orders;

  -- Restore stock consumed by operational orders.
  WITH consumed AS (
    SELECT oi.product_id, SUM(oi.quantity)::integer AS quantity
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.product_id IS NOT NULL
      AND o.payment_status IS DISTINCT FROM 'rejected'
    GROUP BY oi.product_id
  )
  UPDATE public.products p
  SET stock = p.stock + consumed.quantity,
      updated_at = now()
  FROM consumed
  WHERE p.id = consumed.product_id;

  -- Restore stock consumed by loyalty redemptions.
  IF to_regclass('public.loyalty_redemptions') IS NOT NULL THEN
    WITH redeemed AS (
      SELECT product_id, COUNT(*)::integer AS quantity
      FROM public.loyalty_redemptions
      WHERE product_id IS NOT NULL
      GROUP BY product_id
    )
    UPDATE public.products p
    SET stock = p.stock + redeemed.quantity,
        updated_at = now()
    FROM redeemed
    WHERE p.id = redeemed.product_id;
  END IF;

  -- Remove only current operational state. Do NOT delete users, catalog,
  -- settings, family links, audit logs, or historical reports/exports.
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DELETE FROM public.notifications;
  END IF;

  IF to_regclass('public.wallet_transactions') IS NOT NULL THEN
    DELETE FROM public.wallet_transactions;
  END IF;

  IF to_regclass('public.wallet_topup_requests') IS NOT NULL THEN
    DELETE FROM public.wallet_topup_requests;
  END IF;

  IF to_regclass('public.loyalty_point_ledger') IS NOT NULL THEN
    DELETE FROM public.loyalty_point_ledger;
  END IF;

  IF to_regclass('public.loyalty_redemptions') IS NOT NULL THEN
    DELETE FROM public.loyalty_redemptions;
  END IF;

  -- order_items has a restrictive FK to orders, so it must be deleted first.
  DELETE FROM public.order_items;
  DELETE FROM public.orders;

  IF to_regclass('public.wallet_accounts') IS NOT NULL THEN
    UPDATE public.wallet_accounts
    SET balance = 0,
        updated_at = now();
  END IF;

  RETURN v_order_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.reset_all_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_all_orders() TO authenticated;
