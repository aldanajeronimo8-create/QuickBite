-- Order windows are a shared operational source for Admin and Student.
-- The existing admin_upsert_pickup_slot RPC preserves slot IDs, so editing a
-- slot updates its configuration without changing existing order associations.

CREATE TABLE IF NOT EXISTS public.pickup_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  starts_at TIME NOT NULL,
  ends_at TIME NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  max_orders INTEGER CHECK (max_orders IS NULL OR max_orders > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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

-- Harden the existing application order RPC in place. Preserve the current
-- parent/student context contract, credits checkout, student_comment syncing,
-- idempotency and payment validation while adding the operational window gate.
DROP FUNCTION IF EXISTS public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT, UUID);

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
declare
  v_order_id uuid := gen_random_uuid();
  v_order_number text := 'QB' || to_char(now(), 'YYMMDD') || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  v_total numeric(10,2) := 0;
  v_item jsonb;
  v_product record;
  v_quantity integer;
  v_existing_order_number text;
  v_existing_user_id uuid;
  v_slot public.pickup_slots;
  v_orders_count bigint;
  v_local_time time := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::time;
  v_local_date date := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date;
begin
  perform set_config('quickbite.internal_order_tx','1',true);

  if auth.uid() is null or (p_user_id <> public.effective_student_user_id() and not public.is_admin()) then
    raise exception 'not_authorized';
  end if;
  if p_request_id is null then raise exception 'order_request_id_required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'order_items_required'; end if;
  if p_payment_method not in ('nequi','cash','bre-b','credits') then raise exception 'invalid_payment_method'; end if;

  select order_number, user_id into v_existing_order_number, v_existing_user_id
  from public.orders where client_request_id = p_request_id;
  if v_existing_order_number is not null then
    if v_existing_user_id <> p_user_id then raise exception 'order_request_id_conflict'; end if;
    return v_existing_order_number;
  end if;

  -- Lock the active slot before counting today's orders. Concurrent checkouts
  -- for the same window therefore serialize at this point and cannot oversubscribe.
  select s.* into v_slot
  from public.pickup_slots s
  where s.enabled
    and v_local_time >= s.starts_at
    and v_local_time < s.ends_at
  order by s.starts_at
  limit 1
  for update;

  if not found then
    raise exception 'no_active_pickup_window';
  end if;

  select count(*) into v_orders_count
  from public.orders o
  where o.pickup_slot_id = v_slot.id
    and o.status not in ('cancelled','rejected')
    and (o.created_at at time zone 'America/Bogota')::date = v_local_date;

  if v_slot.max_orders is not null and v_orders_count >= v_slot.max_orders then
    raise exception 'pickup_window_full';
  end if;

  begin
    insert into public.orders(
      id,user_id,total,status,payment_method,payment_status,order_number,pickup_code,
      estimated_minutes,payment_reference,notes,student_comment,client_request_id,pickup_slot_id
    ) values(
      v_order_id,p_user_id,0,p_status,p_payment_method,
      case when p_payment_method='credits' then 'confirmed' else p_payment_status end,
      v_order_number,p_pickup_code,p_estimated_minutes,p_payment_reference,
      nullif(trim(p_notes),''),nullif(trim(p_notes),''),p_request_id,v_slot.id
    );
  exception when unique_violation then
    select order_number, user_id into v_existing_order_number, v_existing_user_id
    from public.orders where client_request_id = p_request_id;
    if v_existing_order_number is not null and v_existing_user_id = p_user_id then
      return v_existing_order_number;
    end if;
    raise;
  end;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_quantity := coalesce((v_item->>'quantity')::integer,0);
    if v_quantity <= 0 then raise exception 'invalid_quantity'; end if;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid for update;
    if not found or v_product.available is distinct from true then raise exception 'product_unavailable'; end if;
    if v_product.stock < v_quantity then raise exception 'insufficient_stock'; end if;
    update public.products set stock = stock - v_quantity, updated_at = now() where id = v_product.id;
    insert into public.order_items(order_id,product_id,quantity,price)
      values(v_order_id,v_product.id,v_quantity,v_product.price);
    v_total := v_total + (v_product.price * v_quantity);
  end loop;

  update public.orders set total = v_total where id = v_order_id;

  if p_payment_method = 'credits' then
    perform public.apply_wallet_transaction(
      p_user_id,-v_total,'purchase','Compra QuickBite con créditos',v_order_id::text,v_order_id
    );
    update public.orders
      set payment_status = 'confirmed', payment_reference = 'PAGO-CON-CREDITOS'
      where id = v_order_id;
  end if;

  return v_order_number;
end;
$$;

REVOKE ALL ON FUNCTION public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_tx(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT, UUID) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'pickup_slots'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pickup_slots;
  END IF;
EXCEPTION WHEN undefined_object THEN
  NULL;
END;
$$;
