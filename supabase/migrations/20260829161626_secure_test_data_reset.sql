-- Secure administrative reset for test/operational transaction data.
-- This intentionally preserves accounts, products, rewards, loyalty settings and configuration.
-- The confirmation code is validated server-side using SHA-256; it is never trusted from the UI alone.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.reset_all_test_data(p_confirmation_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_orders INTEGER := 0;
  v_redemptions INTEGER := 0;
  v_points INTEGER := 0;
  v_notifications INTEGER := 0;
  v_export_batches INTEGER := 0;
  v_expected_hash CONSTANT TEXT := '258e3b6d5b096b06bd721d994a46b8c8a1f5a7ee56b9f678b2f5eaab5267210d';
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF encode(digest(COALESCE(p_confirmation_code, ''), 'sha256'), 'hex') <> v_expected_hash THEN
    RAISE EXCEPTION 'invalid_reset_code';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_orders FROM public.orders;
  SELECT COUNT(*)::INTEGER INTO v_redemptions FROM public.loyalty_redemptions;
  SELECT COUNT(*)::INTEGER INTO v_points FROM public.loyalty_point_ledger;

  -- Remove transactional notifications while preserving unrelated/system notifications.
  DELETE FROM public.notifications
  WHERE type IN ('order_status', 'reward_redemption');
  GET DIAGNOSTICS v_notifications = ROW_COUNT;

  -- Redemptions consume one unit of their reward product; return that unit before deleting them.
  UPDATE public.products AS p
  SET stock = p.stock + restored.quantity,
      available = CASE WHEN p.stock + restored.quantity > 0 THEN TRUE ELSE p.available END
  FROM (
    SELECT product_id, COUNT(*)::INTEGER AS quantity
    FROM public.loyalty_redemptions
    GROUP BY product_id
  ) AS restored
  WHERE p.id = restored.product_id;

  DELETE FROM public.loyalty_redemptions WHERE id IS NOT NULL;
  DELETE FROM public.loyalty_point_ledger WHERE id IS NOT NULL;
  DELETE FROM public.orders WHERE id IS NOT NULL;

  IF to_regclass('public.sales_export_batches') IS NOT NULL THEN
    DELETE FROM public.sales_export_batches WHERE id IS NOT NULL;
    GET DIAGNOSTICS v_export_batches = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'orders', v_orders,
    'redemptions', v_redemptions,
    'point_entries', v_points,
    'notifications', v_notifications,
    'export_batches', v_export_batches
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reset_all_test_data(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_all_test_data(TEXT) TO authenticated;
