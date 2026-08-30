ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'purchase',
  ADD COLUMN IF NOT EXISTS redemption_id uuid;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_type_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_type_check CHECK (order_type IN ('purchase', 'redemption'));

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_redemption_id_fkey;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_redemption_id_fkey
  FOREIGN KEY (redemption_id) REFERENCES public.loyalty_redemptions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_redemption_id_uidx
  ON public.orders(redemption_id)
  WHERE redemption_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_order_type_idx
  ON public.orders(order_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.moderate_loyalty_redemption(p_redemption_id uuid, p_status text)
RETURNS public.loyalty_redemptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_red public.loyalty_redemptions%ROWTYPE;
  v_result public.loyalty_redemptions%ROWTYPE;
  v_reward_title text;
  v_order_id uuid;
BEGIN
  IF v_admin IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_admin AND p.role IN ('admin', 'both', 'administrator')
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_status NOT IN ('approved', 'cancelled') THEN
    RAISE EXCEPTION 'invalid_redemption_status';
  END IF;

  SELECT * INTO v_red
  FROM public.loyalty_redemptions
  WHERE id = p_redemption_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'redemption_not_found';
  END IF;

  IF v_red.status NOT IN ('pending', 'reserved') THEN
    RAISE EXCEPTION 'redemption_already_processed';
  END IF;

  UPDATE public.loyalty_redemptions
  SET status = p_status,
      fulfilled_at = NULL
  WHERE id = p_redemption_id
  RETURNING * INTO v_result;

  IF p_status = 'cancelled' THEN
    UPDATE public.loyalty_rewards
    SET stock = COALESCE(stock, 0) + 1,
        updated_at = NOW()
    WHERE id = v_red.reward_id;
    RETURN v_result;
  END IF;

  SELECT title INTO v_reward_title
  FROM public.loyalty_rewards
  WHERE id = v_red.reward_id;

  INSERT INTO public.orders (
    user_id,
    total,
    status,
    payment_method,
    payment_status,
    order_number,
    pickup_code,
    estimated_minutes,
    payment_reference,
    notes,
    order_type,
    redemption_id
  ) VALUES (
    v_red.user_id,
    0,
    'pending',
    'cash',
    'confirmed',
    'CANJE-' || upper(v_red.redemption_code),
    upper(v_red.redemption_code),
    5,
    'CANJE',
    'CANJE: ' || COALESCE(v_reward_title, 'Recompensa') || ' · ' || upper(v_red.redemption_code),
    'redemption',
    v_red.id
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, product_id, quantity, price)
  VALUES (v_order_id, v_red.product_id, 1, 0);

  INSERT INTO public.notifications (user_id, order_id, type, title, body)
  VALUES (
    v_red.user_id,
    v_order_id,
    'order_status',
    'Canje aprobado',
    format('Tu canje %s fue aprobado y ya aparece como pedido especial en la sección Pedidos.', upper(v_red.redemption_code))
  );

  RETURN v_result;
END;
$$;

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

  IF p_status NOT IN ('pending', 'preparing', 'ready', 'delivered') THEN
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
    RAISE EXCEPTION 'payment_not_confirmed';
  END IF;

  IF v_order.status = 'delivered' THEN
    RAISE EXCEPTION 'order_already_delivered';
  END IF;

  IF p_status = 'pending' THEN
    NULL;
  ELSIF v_order.status = 'pending' AND p_status IN ('preparing','ready','delivered') THEN
    NULL;
  ELSIF v_order.status = 'preparing' AND p_status IN ('ready','delivered') THEN
    NULL;
  ELSIF v_order.status = 'ready' AND p_status = 'delivered' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'invalid_order_status_transition';
  END IF;

  UPDATE public.orders
  SET status = p_status,
      ready_at = CASE WHEN p_status = 'ready' AND ready_at IS NULL THEN NOW() ELSE ready_at END,
      delivered_at = CASE WHEN p_status = 'delivered' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
      updated_at = NOW()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  IF v_order.order_type = 'redemption' AND v_order.redemption_id IS NOT NULL AND p_status = 'delivered' THEN
    UPDATE public.loyalty_redemptions
    SET status = 'delivered',
        fulfilled_at = NOW()
    WHERE id = v_order.redemption_id
      AND status = 'approved';
  END IF;

  CASE p_status
    WHEN 'pending' THEN
      v_title := CASE WHEN v_order.order_type = 'redemption' THEN 'Canje en pedido' ELSE 'Pedido recibido' END;
      v_body := format('Tu pedido %s fue recibido por la cafeteria.', v_order.order_number);
    WHEN 'preparing' THEN
      v_title := CASE WHEN v_order.order_type = 'redemption' THEN 'Canje en preparación' ELSE 'Estamos preparando tu pedido' END;
      v_body := format('Tu pedido %s ya esta en preparacion.', v_order.order_number);
    WHEN 'ready' THEN
      v_title := CASE WHEN v_order.order_type = 'redemption' THEN 'Canje listo' ELSE 'Tu pedido esta listo' END;
      v_body := format('Tu pedido %s esta listo para recoger. Codigo: %s.', v_order.order_number, coalesce(v_order.pickup_code, 'consulta en caja'));
    WHEN 'delivered' THEN
      v_title := CASE WHEN v_order.order_type = 'redemption' THEN 'Canje entregado' ELSE 'Pedido entregado' END;
      v_body := format('Tu pedido %s fue marcado como entregado.', v_order.order_number);
  END CASE;

  INSERT INTO public.notifications(user_id, order_id, type, title, body)
  VALUES(v_order.user_id, v_order.id, 'order_status', v_title, v_body);

  RETURN v_order.id;
END;
$$;
