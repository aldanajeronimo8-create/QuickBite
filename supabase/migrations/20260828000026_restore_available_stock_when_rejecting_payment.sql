-- A rejected order must leave each returned product sellable again. This also
-- tolerates legacy orders without an owning user, for which no notification can
-- be addressed.

CREATE OR REPLACE FUNCTION public.admin_moderate_order_payment(
  p_order_id UUID,
  p_action TEXT
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item RECORD;
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
$$;

REVOKE ALL ON FUNCTION public.admin_moderate_order_payment(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_moderate_order_payment(UUID, TEXT) TO authenticated;
