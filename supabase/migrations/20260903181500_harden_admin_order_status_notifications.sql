CREATE OR REPLACE FUNCTION public.admin_update_order_status(p_order_id uuid, p_status text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_title text;
  v_body text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_status NOT IN ('pending', 'preparing', 'ready', 'delivered', 'rejected') THEN
    RAISE EXCEPTION 'invalid_order_status';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.status = 'delivered' THEN RAISE EXCEPTION 'delivered_order_immutable'; END IF;
  IF v_order.status = 'rejected' THEN RAISE EXCEPTION 'rejected_order_immutable'; END IF;

  IF p_status = 'rejected' THEN
    UPDATE public.orders
       SET status = 'rejected', payment_status = 'rejected', updated_at = now()
     WHERE id = p_order_id;
    UPDATE public.products AS p
       SET stock = p.stock + oi.quantity, updated_at = now()
      FROM public.order_items AS oi
     WHERE oi.order_id = p_order_id AND p.id = oi.product_id;
    v_title := 'Pedido rechazado';
    v_body := format('Tu pedido %s fue rechazado por la cafeteria y los productos fueron devueltos al inventario.', v_order.order_number);
  ELSE
    IF p_status = 'delivered' AND v_order.status <> 'ready' THEN RAISE EXCEPTION 'invalid_order_transition'; END IF;
    IF p_status = 'ready' AND v_order.status <> 'preparing' THEN RAISE EXCEPTION 'invalid_order_transition'; END IF;
    IF p_status = 'preparing' AND v_order.status <> 'pending' THEN RAISE EXCEPTION 'invalid_order_transition'; END IF;

    UPDATE public.orders
       SET status = p_status,
           updated_at = now(),
           ready_at = CASE WHEN p_status = 'ready' THEN coalesce(ready_at, now()) ELSE ready_at END,
           delivered_at = CASE WHEN p_status = 'delivered' THEN coalesce(delivered_at, now()) ELSE delivered_at END
     WHERE id = p_order_id;

    CASE p_status
      WHEN 'preparing' THEN v_title := 'Estamos preparando tu pedido'; v_body := format('Tu pedido %s ya esta en preparacion.', v_order.order_number);
      WHEN 'ready' THEN v_title := 'Tu pedido esta listo'; v_body := format('Tu pedido %s esta listo para recoger. Codigo: %s.', v_order.order_number, coalesce(v_order.pickup_code, 'consulta en caja'));
      WHEN 'delivered' THEN v_title := 'Pedido entregado'; v_body := format('Tu pedido %s fue marcado como entregado.', v_order.order_number);
      ELSE v_title := 'Pedido actualizado'; v_body := format('Tu pedido %s fue actualizado.', v_order.order_number);
    END CASE;
  END IF;

  IF v_order.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, order_id, type, title, body)
    VALUES (v_order.user_id, v_order.id, 'order_status', v_title, v_body);
  END IF;

  RETURN v_order.id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_order_status(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(uuid, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
