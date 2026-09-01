CREATE OR REPLACE FUNCTION public.reset_all_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_order_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT COUNT(*)::integer INTO v_order_count FROM public.orders;

  WITH consumed AS (
    SELECT oi.product_id, SUM(oi.quantity)::integer AS quantity
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.product_id IS NOT NULL
      AND o.payment_status IS DISTINCT FROM 'rejected'
    GROUP BY oi.product_id
  )
  UPDATE public.products p
  SET stock = p.stock + c.quantity, updated_at = now()
  FROM consumed c WHERE p.id = c.product_id;

  WITH redeemed AS (
    SELECT product_id, COUNT(*)::integer AS quantity
    FROM public.loyalty_redemptions
    WHERE product_id IS NOT NULL AND status IS DISTINCT FROM 'cancelled'
    GROUP BY product_id
  )
  UPDATE public.products p
  SET stock = p.stock + r.quantity, updated_at = now()
  FROM redeemed r WHERE p.id = r.product_id;

  WITH redeemed AS (
    SELECT reward_id, COUNT(*)::integer AS quantity
    FROM public.loyalty_redemptions
    WHERE status IS DISTINCT FROM 'cancelled'
    GROUP BY reward_id
  )
  UPDATE public.loyalty_rewards lr
  SET stock = COALESCE(lr.stock, 0) + r.quantity, updated_at = now()
  FROM redeemed r WHERE lr.id = r.reward_id;

  IF to_regclass('public.sales_export_batches') IS NOT NULL THEN EXECUTE 'DELETE FROM public.sales_export_batches'; END IF;
  DELETE FROM public.notifications;
  DELETE FROM public.wallet_transactions;
  DELETE FROM public.wallet_topup_requests;
  DELETE FROM public.loyalty_point_ledger;
  DELETE FROM public.loyalty_redemptions;
  DELETE FROM public.order_items;
  DELETE FROM public.orders;

  UPDATE public.wallet_accounts SET balance = 0, updated_at = now();

  DELETE FROM public.report_periods;
  DELETE FROM public.daily_summaries;
  DELETE FROM public.demand_observations;
  DELETE FROM public.system_alerts;
  DELETE FROM public.automation_jobs;

  RETURN v_order_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reset_all_orders() TO authenticated;
