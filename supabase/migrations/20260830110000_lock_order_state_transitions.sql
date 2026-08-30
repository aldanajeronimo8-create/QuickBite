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

  IF p_status NOT IN ('preparing', 'ready', 'delivered') THEN
    RAISE EXCEPTION 'invalid_order_status';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF v_order.payment_status <> 'confirmed' THEN
    RAISE EXCEPTION 'order_not_approved';
  END IF;

  IF v_order.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'order_status_terminal';
  END IF;

  IF v_order.status = 'pending' THEN
    RAISE EXCEPTION 'order_not_approved';
  END IF;

  IF v_order.status = 'preparing' AND p_status NOT IN ('ready', 'delivered') THEN
    RAISE EXCEPTION 'invalid_order_transition';
  END IF;

  IF v_order.status = 'ready' AND p_status <> 'delivered' THEN
    RAISE EXCEPTION 'invalid_order_transition';
  END IF;

  UPDATE public.orders
  SET status = p_status
  WHERE id = p_order_id
  RETURNING * INTO v_order;

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
  END CASE;

  INSERT INTO public.notifications (user_id, order_id, type, title, body)
  VALUES (v_order.user_id, v_order.id, 'order_status', v_title, v_body);

  RETURN v_order.id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_order_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(UUID, TEXT) TO authenticated;
