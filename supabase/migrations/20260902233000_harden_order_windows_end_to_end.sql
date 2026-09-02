-- Order windows are a shared operational source for Admin and Student.
-- The existing admin_upsert_pickup_slot RPC already preserves slot IDs, so editing
-- a slot never changes the pickup_slot_id stored on existing orders.

CREATE TABLE IF NOT EXISTS public.pickup_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  starts_at TIME NOT NULL,
  ends_at TIME NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  max_orders INTEGER CHECK (max_orders IS NULL OR max_orders > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pickup_slots_time_range CHECK (starts_at < ends_at)
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_slot_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_pickup_slot_id_fkey'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_pickup_slot_id_fkey
      FOREIGN KEY (pickup_slot_id) REFERENCES public.pickup_slots(id) ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_orders_pickup_slot_created_at
  ON public.orders(pickup_slot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pickup_slots_enabled_time
  ON public.pickup_slots(enabled, starts_at, ends_at);

DROP TRIGGER IF EXISTS pickup_slots_touch_updated_at ON public.pickup_slots;
CREATE TRIGGER pickup_slots_touch_updated_at
BEFORE UPDATE ON public.pickup_slots
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.pickup_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pickup_slots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pickup_slots TO authenticated;
DROP POLICY IF EXISTS pickup_slots_select_authenticated ON public.pickup_slots;
CREATE POLICY pickup_slots_select_authenticated
  ON public.pickup_slots FOR SELECT TO authenticated
  USING (true);

-- Always evaluate school-day windows in Colombia time instead of relying on the
-- database session timezone. This keeps 09:20–09:35 meaning the same to Admin,
-- Student and the order transaction even when Postgres is configured for UTC.
CREATE OR REPLACE FUNCTION public.get_order_window_status(p_slot_id UUID DEFAULT NULL)
RETURNS TABLE(
  slot_id UUID,
  slot_name TEXT,
  starts_at TIME,
  ends_at TIME,
  enabled BOOLEAN,
  max_orders INTEGER,
  orders_count BIGINT,
  accepting_orders BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    s.id,
    s.name,
    s.starts_at,
    s.ends_at,
    s.enabled,
    s.max_orders,
    (
      SELECT count(*)
      FROM public.orders o
      WHERE o.pickup_slot_id = s.id
        AND o.status NOT IN ('cancelled','rejected')
        AND (o.created_at AT TIME ZONE 'America/Bogota')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date
    )::BIGINT,
    s.enabled
      AND (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::time >= s.starts_at
      AND (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::time < s.ends_at
      AND (
        s.max_orders IS NULL
        OR (
          SELECT count(*)
          FROM public.orders o
          WHERE o.pickup_slot_id = s.id
            AND o.status NOT IN ('cancelled','rejected')
            AND (o.created_at AT TIME ZONE 'America/Bogota')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date
        ) < s.max_orders
      )
  FROM public.pickup_slots s
  WHERE p_slot_id IS NULL OR s.id = p_slot_id
  ORDER BY s.starts_at;
$$;

REVOKE ALL ON FUNCTION public.get_order_window_status(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_window_status(UUID) TO authenticated;

-- Replace every browser-callable order-creation overload so none of them can
-- bypass the operational window. The transaction locks the selected slot row
-- before checking today's count, preventing concurrent checkouts from exceeding
-- the configured capacity.
DROP FUNCTION IF EXISTS public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT, UUID);
DROP FUNCTION IF EXISTS public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB);

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
  v_slot public.pickup_slots;
  v_orders_count BIGINT;
  v_local_time TIME := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::time;
  v_local_date DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date;
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

  SELECT s.*
  INTO v_slot
  FROM public.pickup_slots s
  WHERE s.enabled
    AND v_local_time >= s.starts_at
    AND v_local_time < s.ends_at
  ORDER BY s.starts_at
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_active_pickup_window';
  END IF;

  SELECT count(*)
  INTO v_orders_count
  FROM public.orders o
  WHERE o.pickup_slot_id = v_slot.id
    AND o.status NOT IN ('cancelled','rejected')
    AND (o.created_at AT TIME ZONE 'America/Bogota')::date = v_local_date;

  IF v_slot.max_orders IS NOT NULL AND v_orders_count >= v_slot.max_orders THEN
    RAISE EXCEPTION 'pickup_window_full';
  END IF;

  BEGIN
    INSERT INTO public.orders (
      id, user_id, total, status, payment_method, payment_status, order_number,
      pickup_code, estimated_minutes, payment_reference, notes, client_request_id,
      pickup_slot_id
    ) VALUES (
      v_order_id, p_user_id, 0, p_status, p_payment_method, p_payment_status,
      v_order_number, p_pickup_code, p_estimated_minutes, p_payment_reference,
      NULLIF(trim(p_notes), ''), p_request_id, v_slot.id
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

REVOKE ALL ON FUNCTION public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB) TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'pickup_slots'
  ) THEN
    NULL;
  ELSE
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pickup_slots;
  END IF;
EXCEPTION WHEN undefined_object THEN
  NULL;
END;
$$;
