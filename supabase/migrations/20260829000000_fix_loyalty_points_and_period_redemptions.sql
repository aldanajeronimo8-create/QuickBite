-- Fix loyalty points: award points exactly once when an admin confirms a payment.
CREATE OR REPLACE FUNCTION public.admin_moderate_order_payment(p_order_id uuid, p_action text)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item RECORD;
  v_loyalty_enabled BOOLEAN;
  v_points_per_currency_unit INTEGER;
  v_points INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'invalid_payment_action';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;
  IF v_order.payment_status <> 'pending' THEN
    RAISE EXCEPTION 'payment_already_reviewed';
  END IF;

  IF p_action = 'approve' THEN
    UPDATE public.orders
    SET payment_status = 'confirmed'
    WHERE id = v_order.id
    RETURNING * INTO v_order;

    SELECT enabled, points_per_currency_unit
      INTO v_loyalty_enabled, v_points_per_currency_unit
    FROM public.loyalty_settings
    WHERE id = TRUE;

    IF COALESCE(v_loyalty_enabled, FALSE) AND v_order.user_id IS NOT NULL THEN
      v_points := FLOOR(v_order.total / NULLIF(v_points_per_currency_unit, 0))::INTEGER;
      IF v_points > 0 THEN
        INSERT INTO public.loyalty_point_ledger (user_id, order_id, points, source)
        VALUES (v_order.user_id, v_order.id, v_points, 'order')
        ON CONFLICT (order_id) DO NOTHING;
      END IF;
    END IF;

    IF v_order.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, order_id, type, title, body)
      VALUES (
        v_order.user_id,
        v_order.id,
        'order_status',
        'Pago confirmado',
        format('El pago de tu pedido %s fue confirmado. Ya puedes seguir su preparación.', v_order.order_number)
      );
    END IF;
  ELSE
    FOR v_item IN
      SELECT product_id, quantity
      FROM public.order_items
      WHERE order_id = v_order.id
    LOOP
      UPDATE public.products
      SET stock = stock + v_item.quantity,
          available = TRUE
      WHERE id = v_item.product_id;
    END LOOP;

    UPDATE public.orders
    SET payment_status = 'rejected',
        status = 'cancelled'
    WHERE id = v_order.id
    RETURNING * INTO v_order;

    IF v_order.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, order_id, type, title, body)
      VALUES (
        v_order.user_id,
        v_order.id,
        'order_status',
        'Pedido cancelado',
        format('El pago de tu pedido %s fue rechazado. El pedido se canceló y el stock fue restaurado.', v_order.order_number)
      );
    END IF;
  END IF;

  RETURN v_order;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_moderate_order_payment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_moderate_order_payment(uuid, text) TO authenticated;

-- After a period reset, hidden redemptions must disappear from the admin list,
-- while students can keep their own history and points.
DROP POLICY IF EXISTS loyalty_redemptions_select_own_or_admin ON public.loyalty_redemptions;
CREATE POLICY loyalty_redemptions_select_own_or_admin
  ON public.loyalty_redemptions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (public.is_admin() AND admin_hidden IS DISTINCT FROM TRUE)
  );

-- Repair any confirmed orders that somehow lack their ledger entry.
INSERT INTO public.loyalty_point_ledger (user_id, order_id, points, source)
SELECT
  o.user_id,
  o.id,
  FLOOR(o.total / NULLIF(s.points_per_currency_unit, 0))::INTEGER,
  'order'
FROM public.orders o
CROSS JOIN public.loyalty_settings s
LEFT JOIN public.loyalty_point_ledger l ON l.order_id = o.id
WHERE o.payment_status = 'confirmed'
  AND s.id = TRUE
  AND s.enabled = TRUE
  AND o.user_id IS NOT NULL
  AND FLOOR(o.total / NULLIF(s.points_per_currency_unit, 0)) > 0
  AND l.order_id IS NULL;
