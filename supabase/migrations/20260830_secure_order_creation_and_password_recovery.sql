-- QuickBite production hardening: secure password recovery and order creation.
-- 1) Remove the legacy fixed password-reset code/RPC. Password recovery now uses Supabase Auth email links.
-- 2) Force every client-created order to start pending/pending.
-- 3) Prevent authenticated clients from bypassing the transactional order RPC with direct INSERTs.

-- -----------------------------------------------------------------------------
-- Password recovery
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.reset_user_password(text, text, text);

DELETE FROM public.app_secrets
WHERE key = 'password_reset_code';

-- -----------------------------------------------------------------------------
-- Orders: transactional creation is the only client write path.
-- -----------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS request_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_user_request_id
  ON public.orders(user_id, request_id)
  WHERE request_id IS NOT NULL;

-- Remove both historical overloads before recreating the current signature.
DROP FUNCTION IF EXISTS public.create_order_tx(uuid, text, text, text, text, integer, text, jsonb);
DROP FUNCTION IF EXISTS public.create_order_tx(uuid, text, text, text, text, integer, text, jsonb, text);
DROP FUNCTION IF EXISTS public.create_order_tx(uuid, text, text, text, text, integer, text, jsonb, text, uuid);

CREATE OR REPLACE FUNCTION public.create_order_tx(
  p_user_id UUID,
  p_payment_method TEXT,
  p_payment_status TEXT,
  p_status TEXT,
  p_pickup_code TEXT,
  p_estimated_minutes INTEGER,
  p_payment_reference TEXT,
  p_items JSONB,
  p_notes TEXT DEFAULT NULL,
  p_request_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID := gen_random_uuid();
  v_order_number TEXT;
  v_total NUMERIC(10,2) := 0;
  v_item JSONB;
  v_product RECORD;
  v_quantity INTEGER;
  v_existing_order_number TEXT;
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() <> p_user_id AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'order_items_required';
  END IF;

  -- A retry with the same request id returns the original order instead of
  -- charging/decrementing inventory twice.
  IF p_request_id IS NOT NULL THEN
    SELECT order_number
      INTO v_existing_order_number
    FROM public.orders
    WHERE user_id = p_user_id
      AND request_id = p_request_id
    LIMIT 1;

    IF v_existing_order_number IS NOT NULL THEN
      RETURN v_existing_order_number;
    END IF;
  END IF;

  -- Client-supplied status values are intentionally ignored. New orders always
  -- enter the moderation queue as pending/pending.
  v_order_number := 'QB' || to_char(NOW(), 'YYMMDD')
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  INSERT INTO public.orders (
    id,
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
    request_id
  )
  VALUES (
    v_order_id,
    p_user_id,
    0,
    'pending',
    p_payment_method,
    'pending',
    v_order_number,
    p_pickup_code,
    p_estimated_minutes,
    p_payment_reference,
    NULLIF(trim(p_notes), ''),
    p_request_id
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := COALESCE((v_item ->> 'quantity')::INTEGER, 0);
    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;

    SELECT *
      INTO v_product
    FROM public.products
    WHERE id = (v_item ->> 'product_id')::UUID
    FOR UPDATE;

    IF NOT FOUND OR v_product.available IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'product_unavailable';
    END IF;

    IF v_product.stock < v_quantity THEN
      RAISE EXCEPTION 'insufficient_stock';
    END IF;

    UPDATE public.products
    SET stock = stock - v_quantity
    WHERE id = v_product.id;

    INSERT INTO public.order_items (order_id, product_id, quantity, price)
    VALUES (v_order_id, v_product.id, v_quantity, v_product.price);

    v_total := v_total + (v_product.price * v_quantity);
  END LOOP;

  UPDATE public.orders
  SET total = v_total
  WHERE id = v_order_id;

  RETURN v_order_number;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_tx(uuid, text, text, text, text, integer, text, jsonb, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_tx(uuid, text, text, text, text, integer, text, jsonb, text, uuid) TO authenticated;

-- Clients must use create_order_tx so price, stock and initial state cannot be
-- bypassed. Existing admin UPDATE/DELETE flows remain unchanged.
DROP POLICY IF EXISTS orders_insert_own ON public.orders;
DROP POLICY IF EXISTS order_items_insert_own ON public.order_items;
REVOKE INSERT ON public.orders FROM authenticated;
REVOKE INSERT ON public.order_items FROM authenticated;

COMMENT ON FUNCTION public.create_order_tx(uuid, text, text, text, text, integer, text, jsonb, text, uuid)
  IS 'Creates a pending order atomically, calculates server-side totals, locks stock, and prevents client-supplied status/payment status from bypassing moderation.';
