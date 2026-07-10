ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN ('order_status', 'reward_redemption'));

CREATE TABLE IF NOT EXISTS public.loyalty_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  points_per_currency_unit INTEGER NOT NULL DEFAULT 1000 CHECK (points_per_currency_unit > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.loyalty_settings (id, enabled, points_per_currency_unit)
VALUES (TRUE, TRUE, 1000)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.loyalty_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 2 AND 120),
  description TEXT,
  points_required INTEGER NOT NULL CHECK (points_required > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.loyalty_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reward_id UUID NOT NULL REFERENCES public.loyalty_rewards(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  points_spent INTEGER NOT NULL CHECK (points_spent > 0),
  redemption_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'fulfilled', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fulfilled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_active ON public.loyalty_rewards(active, points_required);
CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_user_created_at ON public.loyalty_redemptions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_status ON public.loyalty_redemptions(status, created_at DESC);

DROP TRIGGER IF EXISTS loyalty_settings_touch_updated_at ON public.loyalty_settings;
CREATE TRIGGER loyalty_settings_touch_updated_at
BEFORE UPDATE ON public.loyalty_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS loyalty_rewards_touch_updated_at ON public.loyalty_rewards;
CREATE TRIGGER loyalty_rewards_touch_updated_at
BEFORE UPDATE ON public.loyalty_rewards
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_redemptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.loyalty_settings REPLICA IDENTITY FULL;
ALTER TABLE public.loyalty_rewards REPLICA IDENTITY FULL;
ALTER TABLE public.loyalty_redemptions REPLICA IDENTITY FULL;

REVOKE ALL ON TABLE public.loyalty_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.loyalty_rewards FROM anon, authenticated;
REVOKE ALL ON TABLE public.loyalty_redemptions FROM anon, authenticated;

GRANT SELECT, UPDATE ON TABLE public.loyalty_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.loyalty_rewards TO authenticated;
GRANT SELECT ON TABLE public.loyalty_redemptions TO authenticated;

DROP POLICY IF EXISTS loyalty_settings_select_authenticated ON public.loyalty_settings;
CREATE POLICY loyalty_settings_select_authenticated
  ON public.loyalty_settings FOR SELECT TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS loyalty_settings_admin_update ON public.loyalty_settings;
CREATE POLICY loyalty_settings_admin_update
  ON public.loyalty_settings FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS loyalty_rewards_select_active_or_admin ON public.loyalty_rewards;
CREATE POLICY loyalty_rewards_select_active_or_admin
  ON public.loyalty_rewards FOR SELECT TO authenticated
  USING (active OR public.is_admin());

DROP POLICY IF EXISTS loyalty_rewards_admin_insert ON public.loyalty_rewards;
CREATE POLICY loyalty_rewards_admin_insert
  ON public.loyalty_rewards FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS loyalty_rewards_admin_update ON public.loyalty_rewards;
CREATE POLICY loyalty_rewards_admin_update
  ON public.loyalty_rewards FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS loyalty_rewards_admin_delete ON public.loyalty_rewards;
CREATE POLICY loyalty_rewards_admin_delete
  ON public.loyalty_rewards FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS loyalty_redemptions_select_own_or_admin ON public.loyalty_redemptions;
CREATE POLICY loyalty_redemptions_select_own_or_admin
  ON public.loyalty_redemptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE OR REPLACE FUNCTION public.redeem_loyalty_reward(p_reward_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.loyalty_settings%ROWTYPE;
  v_reward public.loyalty_rewards%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_redemption_id UUID;
  v_redemption_code TEXT;
  v_earned_points INTEGER;
  v_spent_points INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'student'
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_settings
  FROM public.loyalty_settings
  WHERE id = TRUE;

  IF v_settings.id IS NULL OR NOT v_settings.enabled THEN
    RAISE EXCEPTION 'loyalty_disabled';
  END IF;

  SELECT * INTO v_reward
  FROM public.loyalty_rewards
  WHERE id = p_reward_id AND active = TRUE
  FOR UPDATE;

  IF v_reward.id IS NULL THEN
    RAISE EXCEPTION 'reward_not_found';
  END IF;

  SELECT * INTO v_product
  FROM public.products
  WHERE id = v_reward.product_id
  FOR UPDATE;

  IF v_product.id IS NULL OR NOT v_product.available OR v_product.stock <= 0 THEN
    RAISE EXCEPTION 'reward_out_of_stock';
  END IF;

  SELECT COALESCE(FLOOR(SUM(total) / v_settings.points_per_currency_unit), 0)::INTEGER
  INTO v_earned_points
  FROM public.orders
  WHERE user_id = auth.uid() AND payment_status = 'confirmed';

  SELECT COALESCE(SUM(points_spent), 0)::INTEGER
  INTO v_spent_points
  FROM public.loyalty_redemptions
  WHERE user_id = auth.uid() AND status IN ('reserved', 'fulfilled');

  IF v_earned_points - v_spent_points < v_reward.points_required THEN
    RAISE EXCEPTION 'insufficient_points';
  END IF;

  v_redemption_code := 'RB-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 8));

  INSERT INTO public.loyalty_redemptions (
    user_id,
    reward_id,
    product_id,
    points_spent,
    redemption_code
  )
  VALUES (
    auth.uid(),
    v_reward.id,
    v_product.id,
    v_reward.points_required,
    v_redemption_code
  )
  RETURNING id INTO v_redemption_id;

  UPDATE public.products
  SET stock = stock - 1,
      available = CASE WHEN stock <= 1 THEN FALSE ELSE available END
  WHERE id = v_product.id;

  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (
    auth.uid(),
    'reward_redemption',
    'Canje confirmado',
    format('Reservamos %s para ti. Presenta el codigo %s en caja.', v_reward.title, v_redemption_code)
  );

  RETURN jsonb_build_object(
    'id', v_redemption_id,
    'reward_id', v_reward.id,
    'points_spent', v_reward.points_required,
    'redemption_code', v_redemption_code,
    'status', 'reserved',
    'created_at', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_loyalty_reward(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_reward(UUID) TO authenticated;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['loyalty_settings', 'loyalty_rewards', 'loyalty_redemptions']
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;
