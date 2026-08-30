-- Harden order lifecycle: explicit rejection/cancellation, stock restoration, and immutable delivery.

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'preparing', 'ready', 'delivered', 'rejected'));

CREATE OR REPLACE FUNCTION public.admin_update_order_status(
  p_order_id UUID,
  p_status TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_status NOT IN ('pending', 'preparing', 'ready', 'delivered', 'rejected') THEN
    RAISE EXCEPTION 'invalid_order_status';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF v_order.status = 'delivered' THEN
    RAISE EXCEPTION 'delivered_order_immutable';
  END IF;

  IF v_order.status = 'rejected' THEN
    RAISE EXCEPTION 'rejected_order_immutable';
  END IF;

  IF p_status = 'rejected' THEN
    UPDATE public.orders
    SET status = 'rejected', payment_status = 'rejected'
    WHERE id = p_order_id;

    UPDATE public.products AS p
    SET stock = p.stock + oi.quantity,
        updated_at = NOW()
    FROM public.order_items AS oi
    WHERE oi.order_id = p_order_id
      AND p.id = oi.product_id;

    v_title := 'Pedido rechazado';
    v_body := format('Tu pedido %s fue rechazado por la cafeteria y los productos fueron devueltos al inventario.', v_order.order_number);
  ELSE
    IF p_status = 'delivered' AND v_order.status <> 'ready' THEN
      RAISE EXCEPTION 'invalid_order_transition';
    END IF;
    IF p_status = 'ready' AND v_order.status <> 'preparing' THEN
      RAISE EXCEPTION 'invalid_order_transition';
    END IF;
    IF p_status = 'preparing' AND v_order.status <> 'pending' THEN
      RAISE EXCEPTION 'invalid_order_transition';
    END IF;

    UPDATE public.orders
    SET status = p_status
    WHERE id = p_order_id;

    CASE p_status
      WHEN 'preparing' THEN
        v_title := 'Estamos preparando tu pedido';
        v_body := format('Tu pedido %s ya esta en preparacion.', v_order.order_number);
      WHEN 'ready' THEN
        v_title := 'Tu pedido esta listo';
        v_body := format('Tu pedido %s esta listo para recoger. Codigo: %s.', v_order.order_number, COALESCE(v_order.pickup_code, 'consulta en caja'));
      WHEN 'delivered' THEN
        v_title := 'Pedido entregado';
        v_body := format('Tu pedido %s fue marcado como entregado.', v_order.order_number);
      ELSE
        v_title := 'Pedido actualizado';
        v_body := format('Tu pedido %s fue actualizado.', v_order.order_number);
    END CASE;
  END IF;

  INSERT INTO public.notifications (user_id, order_id, type, title, body)
  VALUES (v_order.user_id, v_order.id, 'order_status', v_title, v_body);

  RETURN v_order.id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_order_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(UUID, TEXT) TO authenticated;

DROP POLICY IF EXISTS orders_update_admin ON public.orders;

CREATE POLICY orders_update_admin
  ON public.orders FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
