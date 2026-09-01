ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('nequi','cash','bre-b','credits'));

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
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
DECLARE
  v_order_id UUID := gen_random_uuid();
  v_order_number TEXT := 'QB' || to_char(now(), 'YYMMDD') || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  v_total NUMERIC(10,2) := 0;
  v_item JSONB;
  v_product RECORD;
  v_quantity INTEGER;
  v_existing_order_number TEXT;
  v_existing_user_id UUID;
  v_wallet_balance NUMERIC(12,2);
BEGIN
  IF auth.uid() IS NULL OR (p_user_id <> public.effective_student_user_id() AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'order_request_id_required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'order_items_required'; END IF;

  SELECT order_number, user_id INTO v_existing_order_number, v_existing_user_id
  FROM public.orders WHERE client_request_id = p_request_id;
  IF v_existing_order_number IS NOT NULL THEN
    IF v_existing_user_id <> p_user_id THEN RAISE EXCEPTION 'order_request_id_conflict'; END IF;
    RETURN v_existing_order_number;
  END IF;

  IF p_payment_method NOT IN ('nequi','cash','bre-b','credits') THEN
    RAISE EXCEPTION 'invalid_payment_method';
  END IF;

  INSERT INTO public.orders (
    id,user_id,total,status,payment_method,payment_status,order_number,pickup_code,
    estimated_minutes,payment_reference,notes,student_comment,client_request_id
  ) VALUES (
    v_order_id,p_user_id,0,p_status,p_payment_method,
    CASE WHEN p_payment_method='credits' THEN 'confirmed' ELSE p_payment_status END,
    v_order_number,p_pickup_code,p_estimated_minutes,p_payment_reference,
    nullif(trim(p_notes),''),nullif(trim(p_notes),''),p_request_id
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := coalesce((v_item->>'quantity')::integer,0);
    IF v_quantity <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id=(v_item->>'product_id')::uuid
    FOR UPDATE;

    IF NOT FOUND OR v_product.available IS DISTINCT FROM true THEN RAISE EXCEPTION 'product_unavailable'; END IF;
    IF v_product.stock < v_quantity THEN RAISE EXCEPTION 'insufficient_stock'; END IF;

    UPDATE public.products SET stock=stock-v_quantity WHERE id=v_product.id;
    INSERT INTO public.order_items(order_id,product_id,quantity,price)
    VALUES(v_order_id,v_product.id,v_quantity,v_product.price);
    v_total := v_total + (v_product.price*v_quantity);
  END LOOP;

  UPDATE public.orders SET total=v_total WHERE id=v_order_id;

  IF p_payment_method='credits' THEN
    INSERT INTO public.wallet_accounts(user_id,balance)
    VALUES(p_user_id,0)
    ON CONFLICT(user_id) DO NOTHING;

    SELECT balance INTO v_wallet_balance
    FROM public.wallet_accounts
    WHERE user_id=p_user_id
    FOR UPDATE;

    IF coalesce(v_wallet_balance,0) < v_total THEN
      RAISE EXCEPTION 'insufficient_wallet_balance';
    END IF;

    PERFORM public.apply_wallet_transaction(
      p_user_id,
      -v_total,
      'purchase',
      'Compra QuickBite ' || v_order_number,
      v_order_number,
      v_order_id
    );

    UPDATE public.orders
    SET payment_status='confirmed', payment_reference='PAGO-CON-CREDITOS'
    WHERE id=v_order_id;
  END IF;

  RETURN v_order_number;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT, UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT);

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
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
  SELECT public.create_order_tx(
    p_user_id,p_payment_method,p_payment_status,p_status,p_pickup_code,
    p_estimated_minutes,p_payment_reference,p_items,NULL,gen_random_uuid()
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
  p_items JSONB,
  p_notes TEXT
)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
  SELECT public.create_order_tx(
    p_user_id,p_payment_method,p_payment_status,p_status,p_pickup_code,
    p_estimated_minutes,p_payment_reference,p_items,p_notes,gen_random_uuid()
  );
$$;
