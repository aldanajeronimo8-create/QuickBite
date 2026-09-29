-- Full QuickBite operational reset.
-- Resets transactional/business state for a new period while preserving
-- authentication, users, catalog, reward definitions and system configuration.
-- The downloaded Excel file is the archive for the closed period.

CREATE OR REPLACE FUNCTION public.reset_all_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public', 'auth'
AS $$
DECLARE
  v_order_count INTEGER;
  v_restored_order_stock INTEGER := 0;
  v_restored_reward_stock INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_order_count
  FROM public.orders;

  -- Return stock consumed by orders that have not already been rejected.
  -- Rejected payments already restore their stock at rejection time.
  WITH consumed AS (
    SELECT oi.product_id, SUM(oi.quantity)::INTEGER AS quantity
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.product_id IS NOT NULL
      AND o.payment_status IS DISTINCT FROM 'rejected'
    GROUP BY oi.product_id
  )
  UPDATE public.products p
  SET stock = p.stock + consumed.quantity,
      updated_at = NOW()
  FROM consumed
  WHERE p.id = consumed.product_id;

  GET DIAGNOSTICS v_restored_order_stock = ROW_COUNT;

  -- Return reward stock consumed by loyalty redemptions during the period.
  IF to_regclass('public.loyalty_redemptions') IS NOT NULL THEN
    WITH redeemed AS (
      SELECT product_id, COUNT(*)::INTEGER AS quantity
      FROM public.loyalty_redemptions
      WHERE product_id IS NOT NULL
      GROUP BY product_id
    )
    UPDATE public.products p
    SET stock = p.stock + redeemed.quantity,
        updated_at = NOW()
    FROM redeemed
    WHERE p.id = redeemed.product_id;

    GET DIAGNOSTICS v_restored_reward_stock = ROW_COUNT;
  END IF;

  -- Clear transient payment/wallet state before orders so foreign keys remain valid.
  IF to_regclass('public.wallet_topup_requests') IS NOT NULL THEN
    DELETE FROM public.wallet_topup_requests;
  END IF;

  IF to_regclass('public.wallet_transactions') IS NOT NULL THEN
    DELETE FROM public.wallet_transactions;
  END IF;

  IF to_regclass('public.wallet_accounts') IS NOT NULL THEN
    UPDATE public.wallet_accounts
    SET balance = 0;
  END IF;

  -- Clear loyalty points and redemptions earned/created during the period.
  IF to_regclass('public.loyalty_point_ledger') IS NOT NULL THEN
    DELETE FROM public.loyalty_point_ledger;
  END IF;

  IF to_regclass('public.loyalty_redemptions') IS NOT NULL THEN
    DELETE FROM public.loyalty_redemptions;
  END IF;

  -- Notifications are transient operational state; accounts remain intact.
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DELETE FROM public.notifications;
  END IF;

  -- Orders cascade to order_items and any dependent transactional records.
  DELETE FROM public.orders;

  -- Clear operational export/analytics period state so the application starts clean.
  IF to_regclass('public.sales_export_batches') IS NOT NULL THEN
    DELETE FROM public.sales_export_batches;
  END IF;

  IF to_regclass('public.report_periods') IS NOT NULL THEN
    DELETE FROM public.report_periods;
  END IF;

  IF to_regclass('public.daily_summaries') IS NOT NULL THEN
    DELETE FROM public.daily_summaries;
  END IF;

  IF to_regclass('public.demand_observations') IS NOT NULL THEN
    DELETE FROM public.demand_observations;
  END IF;

  IF to_regclass('public.system_alerts') IS NOT NULL THEN
    DELETE FROM public.system_alerts;
  END IF;

  -- Do not delete profiles, products, categories, rewards, configuration,
  -- audit logs or system health records.
  RETURN v_order_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_all_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_all_orders() TO authenticated;

-- The legacy test-data reset is not the production period reset.
-- Keep it unavailable to anonymous callers while preserving its existing API.
DO $$
BEGIN
  IF to_regprocedure('public.reset_all_test_data(text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.reset_all_test_data(TEXT) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.reset_all_test_data(TEXT) TO authenticated;
  END IF;
END;
$$;
