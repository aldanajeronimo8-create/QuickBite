-- Fix Student order creation and notes.
-- Remove the legacy overloaded create_order_tx signature so PostgREST can resolve
-- the 9-argument function unambiguously. Keep notes in the transactional insert.
DROP FUNCTION IF EXISTS public.create_order_tx(uuid, text, text, text, text, integer, text, jsonb);

CREATE OR REPLACE FUNCTION public.create_order_tx(
  p_user_id uuid,
  p_payment_method text,
  p_payment_status text,
  p_status text,
  p_pickup_code text,
  p_estimated_minutes integer,
  p_payment_reference text,
  p_items jsonb,
  p_notes text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID := gen_random_uuid();
  v_order_number TEXT := 'QB' || to_char(NOW(), 'YYMMDD') || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  v_total NUMERIC(10,2) := 0;
  v_item JSONB;
  v_product RECORD;
  v_quantity INTEGER;
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() <> p_user_id AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'order_items_required';
  END IF;

  INSERT INTO public.orders (
    id, user_id, total, status, payment_method, payment_status,
    order_number, pickup_code, estimated_minutes, payment_reference, notes
  )
  VALUES (
    v_order_id, p_user_id, 0, p_status, p_payment_method, p_payment_status,
    v_order_number, p_pickup_code, p_estimated_minutes, p_payment_reference,
    NULLIF(trim(p_notes), '')
  );

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

REVOKE ALL ON FUNCTION public.create_order_tx(uuid, text, text, text, text, integer, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_tx(uuid, text, text, text, text, integer, text, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.student_can_update_order_notes_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF auth.uid() = OLD.user_id THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.total IS DISTINCT FROM OLD.total
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
      OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
      OR NEW.order_number IS DISTINCT FROM OLD.order_number
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.pickup_code IS DISTINCT FROM OLD.pickup_code
      OR NEW.estimated_minutes IS DISTINCT FROM OLD.estimated_minutes
      OR NEW.payment_reference IS DISTINCT FROM OLD.payment_reference
      OR NEW.admin_hidden IS DISTINCT FROM OLD.admin_hidden
    THEN
      RAISE EXCEPTION 'students_can_only_update_order_notes';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'not_authorized';
END;
$$;

DROP TRIGGER IF EXISTS trg_student_order_notes_only ON public.orders;
CREATE TRIGGER trg_student_order_notes_only
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.student_can_update_order_notes_only();

DROP POLICY IF EXISTS orders_student_update_notes ON public.orders;
CREATE POLICY orders_student_update_notes
ON public.orders
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
