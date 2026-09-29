-- Global switch for the order-window feature. When disabled, existing windows are preserved
-- but order creation no longer requires an active pickup window.
CREATE TABLE IF NOT EXISTS public.order_window_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.order_window_settings(id, enabled)
VALUES (true, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.order_window_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_window_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.order_window_settings TO authenticated;
DROP POLICY IF EXISTS order_window_settings_select_authenticated ON public.order_window_settings;
CREATE POLICY order_window_settings_select_authenticated
  ON public.order_window_settings FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.get_order_windows_enabled()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$ SELECT enabled FROM public.order_window_settings WHERE id = true; $$;
REVOKE ALL ON FUNCTION public.get_order_windows_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_windows_enabled() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_order_windows_enabled(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE v_enabled boolean;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  INSERT INTO public.order_window_settings(id, enabled, updated_at)
  VALUES (true, coalesce(p_enabled, true), now())
  ON CONFLICT (id) DO UPDATE SET enabled = excluded.enabled, updated_at = now()
  RETURNING enabled INTO v_enabled;
  PERFORM public.write_system_audit_event(
    'operations.order_windows_feature_toggled', 'order_window_settings', 'true',
    jsonb_build_object('enabled', v_enabled)
  );
  RETURN v_enabled;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_order_windows_enabled(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_order_windows_enabled(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_pickup_slot(
  p_id uuid,
  p_name text,
  p_starts_at time,
  p_ends_at time,
  p_enabled boolean DEFAULT true,
  p_max_orders integer DEFAULT NULL
)
RETURNS public.pickup_slots
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  r public.pickup_slots;
  v_name text := left(trim(coalesce(p_name, '')), 80);
  v_starts time := p_starts_at;
  v_ends time := p_ends_at;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'pickup_slot_name_required'; END IF;
  IF v_starts IS NULL OR v_ends IS NULL THEN RAISE EXCEPTION 'pickup_slot_time_required'; END IF;
  IF v_starts >= v_ends THEN RAISE EXCEPTION 'invalid_pickup_slot'; END IF;
  IF p_max_orders IS NOT NULL AND p_max_orders <= 0 THEN RAISE EXCEPTION 'invalid_capacity'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.pickup_slots(name, starts_at, ends_at, enabled, max_orders)
    VALUES(v_name, v_starts, v_ends, coalesce(p_enabled, true), p_max_orders)
    RETURNING * INTO r;
  ELSE
    UPDATE public.pickup_slots
    SET name = v_name,
        starts_at = v_starts,
        ends_at = v_ends,
        enabled = coalesce(p_enabled, true),
        max_orders = p_max_orders
    WHERE id = p_id
    RETURNING * INTO r;
    IF NOT FOUND THEN RAISE EXCEPTION 'slot_not_found'; END IF;
  END IF;

  PERFORM public.write_system_audit_event(
    'operations.pickup_slot_updated', 'pickup_slot', r.id::text,
    jsonb_build_object(
      'name', r.name,
      'starts_at', r.starts_at::text,
      'ends_at', r.ends_at::text,
      'enabled', r.enabled,
      'max_orders', r.max_orders
    )
  );
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_upsert_pickup_slot(uuid, text, time, time, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_pickup_slot(uuid, text, time, time, boolean, integer) TO authenticated;

-- Preserve the existing checkout semantics and add the global feature gate.
DROP FUNCTION IF EXISTS public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.create_order_tx(
  p_user_id UUID, p_payment_method TEXT, p_payment_status TEXT, p_status TEXT,
  p_pickup_code TEXT, p_estimated_minutes INTEGER, p_payment_reference TEXT,
  p_items JSONB, p_notes TEXT, p_request_id UUID
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_order_id uuid := gen_random_uuid();
  v_order_number text := 'QB' || to_char(now(), 'YYMMDD') || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  v_total numeric(10,2) := 0;
  v_item jsonb; v_product record; v_quantity integer;
  v_existing_order_number text; v_existing_user_id uuid;
  v_slot public.pickup_slots; v_orders_count bigint;
  v_local_time time := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::time;
  v_local_date date := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date;
  v_windows_enabled boolean := coalesce(public.get_order_windows_enabled(), true);
BEGIN
  PERFORM set_config('quickbite.internal_order_tx','1',true);
  IF auth.uid() IS NULL OR (p_user_id <> public.effective_student_user_id() AND NOT public.is_admin()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'order_request_id_required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'order_items_required'; END IF;
  IF p_payment_method NOT IN ('nequi','cash','bre-b','credits') THEN RAISE EXCEPTION 'invalid_payment_method'; END IF;

  SELECT order_number, user_id INTO v_existing_order_number, v_existing_user_id FROM public.orders WHERE client_request_id = p_request_id;
  IF v_existing_order_number IS NOT NULL THEN
    IF v_existing_user_id <> p_user_id THEN RAISE EXCEPTION 'order_request_id_conflict'; END IF;
    RETURN v_existing_order_number;
  END IF;

  IF v_windows_enabled THEN
    SELECT s.* INTO v_slot FROM public.pickup_slots s
    WHERE s.enabled AND v_local_time >= s.starts_at AND v_local_time < s.ends_at
    ORDER BY s.starts_at LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'no_active_pickup_window'; END IF;

    SELECT count(*) INTO v_orders_count FROM public.orders o
    WHERE o.pickup_slot_id = v_slot.id AND o.status NOT IN ('cancelled','rejected')
      AND (o.created_at AT TIME ZONE 'America/Bogota')::date = v_local_date;
    IF v_slot.max_orders IS NOT NULL AND v_orders_count >= v_slot.max_orders THEN RAISE EXCEPTION 'pickup_window_full'; END IF;
  END IF;

  BEGIN
    INSERT INTO public.orders(
      id,user_id,total,status,payment_method,payment_status,order_number,pickup_code,
      estimated_minutes,payment_reference,notes,student_comment,client_request_id,pickup_slot_id
    ) VALUES(
      v_order_id,p_user_id,0,p_status,p_payment_method,
      CASE WHEN p_payment_method='credits' THEN 'confirmed' ELSE p_payment_status END,
      v_order_number,p_pickup_code,p_estimated_minutes,p_payment_reference,
      nullif(trim(p_notes),''),nullif(trim(p_notes),''),p_request_id,
      CASE WHEN v_windows_enabled THEN v_slot.id ELSE NULL END
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT order_number, user_id INTO v_existing_order_number, v_existing_user_id FROM public.orders WHERE client_request_id = p_request_id;
    IF v_existing_order_number IS NOT NULL AND v_existing_user_id = p_user_id THEN RETURN v_existing_order_number; END IF;
    RAISE;
  END;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_quantity := coalesce((v_item->>'quantity')::integer,0);
    IF v_quantity <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
    SELECT * INTO v_product FROM public.products WHERE id=(v_item->>'product_id')::uuid FOR UPDATE;
    IF NOT FOUND OR v_product.available IS DISTINCT FROM true THEN RAISE EXCEPTION 'product_unavailable'; END IF;
    IF v_product.stock < v_quantity THEN RAISE EXCEPTION 'insufficient_stock'; END IF;
    UPDATE public.products SET stock = stock - v_quantity, updated_at = now() WHERE id = v_product.id;
    INSERT INTO public.order_items(order_id,product_id,quantity,price) VALUES(v_order_id,v_product.id,v_quantity,v_product.price);
    v_total := v_total + (v_product.price * v_quantity);
  END LOOP;

  UPDATE public.orders SET total = v_total WHERE id = v_order_id;
  IF p_payment_method = 'credits' THEN
    PERFORM public.apply_wallet_transaction(p_user_id,-v_total,'purchase','Compra QuickBite con créditos',v_order_id::text,v_order_id);
    UPDATE public.orders SET payment_status = 'confirmed', payment_reference = 'PAGO-CON-CREDITOS' WHERE id = v_order_id;
  END IF;
  RETURN v_order_number;
END;
$$;
REVOKE ALL ON FUNCTION public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT, UUID) TO authenticated;
