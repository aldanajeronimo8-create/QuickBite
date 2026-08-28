-- Add the combined role and the Supabase-backed loyalty program.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'student', 'both'));

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'both')
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_user_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_ti TEXT DEFAULT NULL,
  p_password TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_role TEXT := lower(trim(p_role));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_role NOT IN ('admin', 'student', 'both') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  IF v_role = 'student' AND (p_ti IS NULL OR trim(p_ti) = '') THEN RAISE EXCEPTION 'ti_required'; END IF;
  IF p_password IS NOT NULL AND trim(p_password) <> '' AND length(trim(p_password)) < 6 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;
  IF p_ti IS NOT NULL AND trim(p_ti) <> '' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE ti = trim(p_ti) AND id <> p_user_id
  ) THEN RAISE EXCEPTION 'ti_already_registered'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE email = v_email AND id <> p_user_id
  ) OR EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = v_email AND id <> p_user_id
  ) THEN RAISE EXCEPTION 'email_already_registered'; END IF;

  UPDATE auth.users
  SET email = v_email,
      encrypted_password = CASE
        WHEN p_password IS NOT NULL AND trim(p_password) <> ''
          THEN extensions.crypt(p_password, extensions.gen_salt('bf'))
        ELSE encrypted_password
      END,
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('full_name', trim(p_full_name), 'role', v_role),
      updated_at = NOW()
  WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'auth_user_not_found'; END IF;

  UPDATE auth.identities
  SET identity_data = identity_data || jsonb_build_object('email', v_email, 'email_verified', true),
      updated_at = NOW()
  WHERE user_id = p_user_id AND provider = 'email';

  INSERT INTO public.profiles (id, email, full_name, role, ti)
  VALUES (p_user_id, v_email, trim(p_full_name), v_role, NULLIF(trim(COALESCE(p_ti, '')), ''))
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        ti = EXCLUDED.ti,
        updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_role TEXT DEFAULT 'student',
  p_ti TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT := lower(trim(p_email));
  v_role TEXT := lower(trim(p_role));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_role NOT IN ('admin', 'student', 'both') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  IF length(trim(p_password)) < 6 THEN RAISE EXCEPTION 'password_too_short'; END IF;
  IF v_role = 'student' AND (p_ti IS NULL OR trim(p_ti) = '') THEN RAISE EXCEPTION 'ti_required'; END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email LIMIT 1;
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      v_email, extensions.crypt(p_password, extensions.gen_salt('bf')), NOW(),
      jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
      jsonb_build_object('full_name', trim(p_full_name), 'role', v_role), NOW(), NOW()
    );
    INSERT INTO auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_user_id::text, v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
      'email', NOW(), NOW(), NOW()
    ) ON CONFLICT DO NOTHING;
  ELSE
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object('full_name', trim(p_full_name), 'role', v_role),
        updated_at = NOW()
    WHERE id = v_user_id;
  END IF;

  IF p_ti IS NOT NULL AND trim(p_ti) <> '' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE ti = trim(p_ti) AND id <> v_user_id
  ) THEN RAISE EXCEPTION 'ti_already_registered'; END IF;

  INSERT INTO public.profiles (id, email, full_name, role, ti)
  VALUES (v_user_id, v_email, trim(p_full_name), v_role, NULLIF(trim(COALESCE(p_ti, '')), ''))
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        ti = EXCLUDED.ti,
        updated_at = NOW();
  RETURN v_user_id;
END;
$$;

CREATE TABLE IF NOT EXISTS public.loyalty_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  enabled BOOLEAN NOT NULL DEFAULT true,
  points_per_amount INTEGER NOT NULL DEFAULT 1 CHECK (points_per_amount > 0),
  currency_amount INTEGER NOT NULL DEFAULT 1000 CHECK (currency_amount > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Preserve the pre-existing loyalty schema while normalising it for the app.
ALTER TABLE public.loyalty_settings
  ADD COLUMN IF NOT EXISTS points_per_amount INTEGER,
  ADD COLUMN IF NOT EXISTS currency_amount INTEGER;
UPDATE public.loyalty_settings
SET points_per_amount = COALESCE(points_per_amount, 1),
    currency_amount = COALESCE(
      currency_amount,
      NULLIF(to_jsonb(loyalty_settings) ->> 'points_per_currency_unit', '')::INTEGER,
      1000
    );
ALTER TABLE public.loyalty_settings
  ALTER COLUMN points_per_amount SET DEFAULT 1,
  ALTER COLUMN points_per_amount SET NOT NULL,
  ALTER COLUMN currency_amount SET DEFAULT 1000,
  ALTER COLUMN currency_amount SET NOT NULL;

INSERT INTO public.loyalty_settings (id, enabled, points_per_amount, currency_amount)
VALUES (true, true, 1, 1000)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.loyalty_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  points_cost INTEGER NOT NULL CHECK (points_cost > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  stock INTEGER CHECK (stock IS NULL OR stock >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.loyalty_rewards
  ADD COLUMN IF NOT EXISTS points_cost INTEGER,
  ADD COLUMN IF NOT EXISTS stock INTEGER;
UPDATE public.loyalty_rewards
SET points_cost = COALESCE(
  points_cost,
  NULLIF(to_jsonb(loyalty_rewards) ->> 'points_required', '')::INTEGER
)
WHERE points_cost IS NULL;
ALTER TABLE public.loyalty_rewards
  ALTER COLUMN points_cost SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.loyalty_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reward_id UUID NOT NULL REFERENCES public.loyalty_rewards(id) ON DELETE RESTRICT,
  points_spent INTEGER NOT NULL CHECK (points_spent > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'delivered', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.loyalty_redemptions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.loyalty_redemptions DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;
UPDATE public.loyalty_redemptions
SET status = CASE status
  WHEN 'reserved' THEN 'pending'
  WHEN 'fulfilled' THEN 'delivered'
  ELSE status
END;
ALTER TABLE public.loyalty_redemptions
  ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.loyalty_redemptions
  ADD CONSTRAINT loyalty_redemptions_status_check
  CHECK (status IN ('pending', 'approved', 'delivered', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_user_created
  ON public.loyalty_redemptions(user_id, created_at DESC);

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

DROP POLICY IF EXISTS loyalty_settings_admin_all ON public.loyalty_settings;
CREATE POLICY loyalty_settings_admin_all ON public.loyalty_settings
FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS loyalty_rewards_read ON public.loyalty_rewards;
CREATE POLICY loyalty_rewards_read ON public.loyalty_rewards
FOR SELECT TO authenticated USING (active OR public.is_admin());
DROP POLICY IF EXISTS loyalty_rewards_admin_all ON public.loyalty_rewards;
CREATE POLICY loyalty_rewards_admin_all ON public.loyalty_rewards
FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS loyalty_redemptions_admin_all ON public.loyalty_redemptions;
CREATE POLICY loyalty_redemptions_admin_all ON public.loyalty_redemptions
FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS loyalty_redemptions_select_own ON public.loyalty_redemptions;
CREATE POLICY loyalty_redemptions_select_own ON public.loyalty_redemptions
FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP FUNCTION IF EXISTS public.redeem_loyalty_reward(UUID);
CREATE FUNCTION public.redeem_loyalty_reward(p_reward_id UUID)
RETURNS public.loyalty_redemptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_settings public.loyalty_settings%ROWTYPE;
  v_reward public.loyalty_rewards%ROWTYPE;
  v_points INTEGER;
  v_redemption public.loyalty_redemptions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO v_settings FROM public.loyalty_settings WHERE id = true;
  IF NOT FOUND OR NOT v_settings.enabled THEN RAISE EXCEPTION 'loyalty_disabled'; END IF;
  SELECT * INTO v_reward FROM public.loyalty_rewards WHERE id = p_reward_id FOR UPDATE;
  IF NOT FOUND OR NOT v_reward.active THEN RAISE EXCEPTION 'reward_unavailable'; END IF;
  IF v_reward.stock IS NOT NULL AND v_reward.stock <= 0 THEN RAISE EXCEPTION 'reward_out_of_stock'; END IF;

  SELECT
    GREATEST(0,
      COALESCE(SUM(FLOOR(o.total / v_settings.currency_amount) * v_settings.points_per_amount)
        FILTER (WHERE o.payment_status = 'confirmed'), 0)
      - COALESCE((SELECT SUM(points_spent) FROM public.loyalty_redemptions
          WHERE user_id = v_user_id AND status <> 'cancelled'), 0)
    )::INTEGER
  INTO v_points
  FROM public.orders o
  WHERE o.user_id = v_user_id;

  IF v_points < v_reward.points_cost THEN RAISE EXCEPTION 'insufficient_loyalty_points'; END IF;
  INSERT INTO public.loyalty_redemptions (user_id, reward_id, points_spent)
  VALUES (v_user_id, v_reward.id, v_reward.points_cost)
  RETURNING * INTO v_redemption;
  IF v_reward.stock IS NOT NULL THEN
    UPDATE public.loyalty_rewards SET stock = stock - 1 WHERE id = v_reward.id;
  END IF;
  RETURN v_redemption;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_protected_admin_emails()
RETURNS TABLE(email TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY SELECT protected_admins.email FROM public.protected_admins ORDER BY protected_admins.email;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_loyalty_reward(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_reward(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.list_protected_admin_emails() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_protected_admin_emails() TO authenticated;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['loyalty_settings', 'loyalty_rewards', 'loyalty_redemptions']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;
