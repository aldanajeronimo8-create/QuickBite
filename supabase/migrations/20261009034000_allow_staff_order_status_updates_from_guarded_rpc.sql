BEGIN;

CREATE OR REPLACE FUNCTION public.staff_update_order_status(p_order_id UUID, p_status TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_actor_email TEXT;
  v_title TEXT;
  v_body TEXT;
  v_old_status TEXT;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_status NOT IN ('preparing', 'ready', 'delivered') THEN
    RAISE EXCEPTION 'invalid_order_status';
  END IF;

  SELECT *
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF v_order.id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.status = 'delivered' THEN RAISE EXCEPTION 'delivered_order_immutable'; END IF;
  IF v_order.status = 'rejected' THEN RAISE EXCEPTION 'rejected_order_immutable'; END IF;

  v_old_status := v_order.status;
  IF p_status = 'preparing' AND v_order.status <> 'pending' THEN RAISE EXCEPTION 'invalid_order_transition'; END IF;
  IF p_status = 'ready' AND v_order.status <> 'preparing' THEN RAISE EXCEPTION 'invalid_order_transition'; END IF;
  IF p_status = 'delivered' AND v_order.status <> 'ready' THEN RAISE EXCEPTION 'invalid_order_transition'; END IF;

  -- The role and transition are validated above. Set the existing transaction-local
  -- guard so the order-notes trigger permits this authorized status RPC only.
  PERFORM set_config('quickbite.internal_order_tx', '1', true);

  UPDATE public.orders
     SET status = p_status,
         updated_at = now(),
         ready_at = CASE WHEN p_status = 'ready' THEN COALESCE(ready_at, now()) ELSE ready_at END,
         delivered_at = CASE WHEN p_status = 'delivered' THEN COALESCE(delivered_at, now()) ELSE delivered_at END
   WHERE id = p_order_id;

  SELECT email INTO v_actor_email FROM auth.users WHERE id = auth.uid();
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

  IF v_order.user_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, order_id, type, title, body)
    VALUES(v_order.user_id, v_order.id, 'order_status', v_title, v_body);
  END IF;

  INSERT INTO public.audit_logs(actor_id, actor_email, action, entity, entity_id, metadata)
  VALUES(auth.uid(), v_actor_email, 'order.staff_status_change', 'order', p_order_id::text,
         jsonb_build_object('from', v_old_status, 'to', p_status));

  RETURN p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_update_order_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_update_order_status(UUID, TEXT) TO authenticated;

COMMIT;
