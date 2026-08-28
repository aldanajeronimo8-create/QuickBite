-- The order-notes deployment and the idempotency deployment evolved from the
-- same order RPC. This final signature preserves both: a client may attach a
-- note and safely retry the same request id after a transient network error.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS client_request_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_client_request_id_key'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_client_request_id_key UNIQUE (client_request_id);
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, UUID);

CREATE OR REPLACE FUNCTION public.create_order_tx(
  p_user_id UUID,
  p_payment_method TEXT,
  p_payment_status TEXT,
  p_status TEXT,
  p_pickup_code TEXT,
  p_estimated_minutes INTEGER,
  p_payment_reference TEXT,
  p_items JSONB,
  p_notes TEXT,
  p_request_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_order_id UUID := gen_random_uuid();
  v_order_number TEXT := 'QB' || to_char(NOW(), 'YYMMDD') || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  v_total NUMERIC(10,2) := 0;
  v_item JSONB;
  v_product RECORD;
  v_quantity INTEGER;
  v_existing_order_number TEXT;
  v_existing_user_id UUID;
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() <> p_user_id AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'order_request_id_required';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'order_items_required';
  END IF;

  SELECT order_number, user_id
  INTO v_existing_order_number, v_existing_user_id
  FROM public.orders
  WHERE client_request_id = p_request_id;
  IF v_existing_order_number IS NOT NULL THEN
    IF v_existing_user_id <> p_user_id THEN RAISE EXCEPTION 'order_request_id_conflict'; END IF;
    RETURN v_existing_order_number;
  END IF;

  BEGIN
    INSERT INTO public.orders (
      id, user_id, total, status, payment_method, payment_status, order_number,
      pickup_code, estimated_minutes, payment_reference, notes, client_request_id
    ) VALUES (
      v_order_id, p_user_id, 0, p_status, p_payment_method, p_payment_status,
      v_order_number, p_pickup_code, p_estimated_minutes, p_payment_reference,
      NULLIF(trim(p_notes), ''), p_request_id
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT order_number, user_id
    INTO v_existing_order_number, v_existing_user_id
    FROM public.orders
    WHERE client_request_id = p_request_id;
    IF v_existing_order_number IS NOT NULL AND v_existing_user_id = p_user_id THEN
      RETURN v_existing_order_number;
    END IF;
    RAISE;
  END;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := COALESCE((v_item ->> 'quantity')::INTEGER, 0);
    IF v_quantity <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item ->> 'product_id')::UUID
    FOR UPDATE;

    IF NOT FOUND OR v_product.available IS DISTINCT FROM true THEN RAISE EXCEPTION 'product_unavailable'; END IF;
    IF v_product.stock < v_quantity THEN RAISE EXCEPTION 'insufficient_stock'; END IF;

    UPDATE public.products SET stock = stock - v_quantity WHERE id = v_product.id;
    INSERT INTO public.order_items (order_id, product_id, quantity, price)
    VALUES (v_order_id, v_product.id, v_quantity, v_product.price);
    v_total := v_total + (v_product.price * v_quantity);
  END LOOP;

  UPDATE public.orders SET total = v_total WHERE id = v_order_id;
  RETURN v_order_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_order_tx(
  p_user_id UUID,
  p_payment_method TEXT,
  p_payment_status TEXT,
  p_status TEXT,
  p_pickup_code TEXT,
  p_estimated_minutes INTEGER,
  p_payment_reference TEXT,
  p_items JSONB,
  p_notes TEXT
)
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.create_order_tx(
    p_user_id, p_payment_method, p_payment_status, p_status, p_pickup_code,
    p_estimated_minutes, p_payment_reference, p_items, p_notes, gen_random_uuid()
  );
$$;

CREATE OR REPLACE FUNCTION public.create_order_tx(
  p_user_id UUID,
  p_payment_method TEXT,
  p_payment_status TEXT,
  p_status TEXT,
  p_pickup_code TEXT,
  p_estimated_minutes INTEGER,
  p_payment_reference TEXT,
  p_items JSONB
)
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.create_order_tx(
    p_user_id, p_payment_method, p_payment_status, p_status, p_pickup_code,
    p_estimated_minutes, p_payment_reference, p_items, NULL, gen_random_uuid()
  );
$$;

REVOKE ALL ON FUNCTION public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB) TO authenticated;
