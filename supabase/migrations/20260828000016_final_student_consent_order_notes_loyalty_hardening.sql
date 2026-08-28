-- Final hardening for student privacy, order notes and loyalty consistency.
-- The institutional privacy policy must still be completed with the real data controller's official contact details.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS public.student_data_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  representative_name TEXT NOT NULL,
  representative_relationship TEXT NOT NULL,
  representative_email TEXT NOT NULL,
  student_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  representative_authorized BOOLEAN NOT NULL DEFAULT FALSE,
  purpose TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_student_data_consents_student_created
  ON public.student_data_consents(student_id, consented_at DESC);

ALTER TABLE public.student_data_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_data_consents FROM anon, authenticated;
GRANT SELECT ON TABLE public.student_data_consents TO authenticated;

DROP POLICY IF EXISTS student_data_consents_select_own_or_admin ON public.student_data_consents;
CREATE POLICY student_data_consents_select_own_or_admin
  ON public.student_data_consents FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.is_admin());

CREATE OR REPLACE FUNCTION public.create_student_profile_with_consent(
  p_user_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_ti TEXT,
  p_guardian_name TEXT,
  p_guardian_relationship TEXT,
  p_guardian_email TEXT,
  p_student_acknowledged BOOLEAN,
  p_guardian_authorized BOOLEAN,
  p_purpose TEXT,
  p_policy_version TEXT DEFAULT '2026-08-28'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT p_student_acknowledged OR NOT p_guardian_authorized THEN
    RAISE EXCEPTION 'consent_required';
  END IF;

  IF NULLIF(trim(p_guardian_name), '') IS NULL
     OR NULLIF(trim(p_guardian_relationship), '') IS NULL
     OR NULLIF(trim(p_guardian_email), '') IS NULL THEN
    RAISE EXCEPTION 'guardian_information_required';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE ti = trim(p_ti) AND id <> p_user_id) THEN
    RAISE EXCEPTION 'ti_already_registered';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, ti)
  VALUES (p_user_id, lower(trim(p_email)), trim(p_full_name), 'student', trim(p_ti))
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = 'student',
        ti = EXCLUDED.ti;

  v_profile_id := p_user_id;

  INSERT INTO public.student_data_consents (
    student_id,
    representative_name,
    representative_relationship,
    representative_email,
    student_acknowledged,
    representative_authorized,
    purpose,
    policy_version
  )
  VALUES (
    p_user_id,
    trim(p_guardian_name),
    trim(p_guardian_relationship),
    lower(trim(p_guardian_email)),
    p_student_acknowledged,
    p_guardian_authorized,
    trim(p_purpose),
    trim(p_policy_version)
  );

  RETURN v_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_student_profile_with_consent(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,BOOLEAN,BOOLEAN,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_student_profile_with_consent(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,BOOLEAN,BOOLEAN,TEXT,TEXT) TO authenticated;

-- Keep the client-facing RPC authoritative: the database recalculates the order total from products.
CREATE OR REPLACE FUNCTION public.create_order_tx(
  p_user_id UUID,
  p_payment_method TEXT,
  p_payment_status TEXT,
  p_status TEXT,
  p_pickup_code TEXT,
  p_estimated_minutes INTEGER,
  p_payment_reference TEXT,
  p_items JSONB,
  p_notes TEXT DEFAULT NULL
)
RETURNS TEXT
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

  INSERT INTO public.orders (id,user_id,total,status,payment_method,payment_status,order_number,pickup_code,estimated_minutes,payment_reference,notes)
  VALUES (v_order_id,p_user_id,0,p_status,p_payment_method,p_payment_status,v_order_number,p_pickup_code,p_estimated_minutes,p_payment_reference,NULLIF(trim(p_notes),''));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := COALESCE((v_item ->> 'quantity')::INTEGER, 0);
    IF v_quantity <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

    SELECT * INTO v_product FROM public.products
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

REVOKE ALL ON FUNCTION public.create_order_tx(UUID,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,JSONB,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_tx(UUID,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,JSONB,TEXT) TO authenticated;

-- Normalize legacy rewards that may have a nullable/incorrect points_cost column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='loyalty_rewards' AND column_name='points_cost'
  ) THEN
    UPDATE public.loyalty_rewards
    SET points_cost = points_required
    WHERE points_cost IS NULL OR points_cost <> points_required;

    ALTER TABLE public.loyalty_rewards
      ALTER COLUMN points_cost SET DEFAULT 1;
  END IF;
END $$;

INSERT INTO public.loyalty_settings (id, enabled, points_per_currency_unit)
VALUES (TRUE, TRUE, 1000)
ON CONFLICT (id) DO UPDATE
SET enabled = TRUE,
    points_per_currency_unit = GREATEST(public.loyalty_settings.points_per_currency_unit, 1),
    updated_at = NOW();
