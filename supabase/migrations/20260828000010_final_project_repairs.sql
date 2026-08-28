-- Final project repairs: comments on orders + loyalty schema compatibility.
-- This migration is additive and keeps existing loyalty data usable.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS comment TEXT;

ALTER TABLE public.loyalty_rewards
  ADD COLUMN IF NOT EXISTS points_required INTEGER;

UPDATE public.loyalty_rewards
SET points_required = COALESCE(points_required, points_cost)
WHERE points_required IS NULL;

UPDATE public.loyalty_rewards
SET points_cost = COALESCE(points_cost, points_required)
WHERE points_cost IS NULL;

DO $$
BEGIN
  ALTER TABLE public.loyalty_rewards
    DROP CONSTRAINT IF EXISTS loyalty_rewards_points_required_check;
  ALTER TABLE public.loyalty_rewards
    ADD CONSTRAINT loyalty_rewards_points_required_check
    CHECK (points_required IS NULL OR points_required > 0);
END $$;

CREATE OR REPLACE FUNCTION public.sync_loyalty_reward_points()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.points_cost IS NULL AND NEW.points_required IS NULL THEN
    RAISE EXCEPTION 'points_required';
  END IF;

  IF NEW.points_cost IS NULL THEN
    NEW.points_cost := NEW.points_required;
  ELSIF NEW.points_required IS NULL THEN
    NEW.points_required := NEW.points_cost;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.points_cost := NEW.points_required;
  ELSIF NEW.points_required IS DISTINCT FROM OLD.points_required THEN
    NEW.points_cost := NEW.points_required;
  ELSE
    NEW.points_required := NEW.points_cost;
  END IF;

  IF NEW.points_cost <= 0 OR NEW.points_required <= 0 THEN
    RAISE EXCEPTION 'points_required';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loyalty_rewards_sync_points ON public.loyalty_rewards;
CREATE TRIGGER loyalty_rewards_sync_points
BEFORE INSERT OR UPDATE OF points_cost, points_required
ON public.loyalty_rewards
FOR EACH ROW
EXECUTE FUNCTION public.sync_loyalty_reward_points();

CREATE OR REPLACE FUNCTION public.redeem_loyalty_reward(p_reward_id UUID)
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
  v_reward_cost INTEGER;
  v_currency_amount INTEGER;
  v_points_per_amount INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_settings
  FROM public.loyalty_settings
  WHERE id = TRUE;

  IF NOT FOUND OR NOT v_settings.enabled THEN
    RAISE EXCEPTION 'loyalty_disabled';
  END IF;

  v_currency_amount := COALESCE(v_settings.currency_amount, v_settings.points_per_currency_unit, 1000);
  v_points_per_amount := COALESCE(v_settings.points_per_amount, 1);

  SELECT * INTO v_reward
  FROM public.loyalty_rewards
  WHERE id = p_reward_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_reward.active THEN
    RAISE EXCEPTION 'reward_unavailable';
  END IF;

  v_reward_cost := COALESCE(v_reward.points_required, v_reward.points_cost);
  IF v_reward_cost IS NULL OR v_reward_cost <= 0 THEN
    RAISE EXCEPTION 'invalid_reward_points';
  END IF;

  IF v_reward.stock IS NOT NULL AND v_reward.stock <= 0 THEN
    RAISE EXCEPTION 'reward_out_of_stock';
  END IF;

  SELECT GREATEST(
    0,
    COALESCE(
      SUM(FLOOR(o.total / v_currency_amount) * v_points_per_amount)
        FILTER (WHERE o.payment_status = 'confirmed'),
      0
    )::INTEGER
    - COALESCE(
        (
          SELECT SUM(points_spent)
          FROM public.loyalty_redemptions
          WHERE user_id = v_user_id
            AND status <> 'cancelled'
        ),
        0
      )::INTEGER
  )
  INTO v_points
  FROM public.orders o
  WHERE o.user_id = v_user_id;

  IF v_points < v_reward_cost THEN
    RAISE EXCEPTION 'insufficient_loyalty_points';
  END IF;

  INSERT INTO public.loyalty_redemptions (user_id, reward_id, points_spent)
  VALUES (v_user_id, v_reward.id, v_reward_cost)
  RETURNING * INTO v_redemption;

  IF v_reward.stock IS NOT NULL THEN
    UPDATE public.loyalty_rewards
    SET stock = stock - 1
    WHERE id = v_reward.id;
  END IF;

  RETURN v_redemption;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_loyalty_reward(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_reward(UUID) TO authenticated;

DROP POLICY IF EXISTS orders_update_own_comment ON public.orders;
CREATE POLICY orders_update_own_comment
  ON public.orders FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_orders_user_created_at_comment
  ON public.orders(user_id, created_at DESC);
