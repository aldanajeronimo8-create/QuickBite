-- PostgreSQL cannot change a function return type with CREATE OR REPLACE.
-- The earlier implementation returned a loyalty_redemptions row, whereas the
-- client-facing implementation below returns JSONB. Dropping only this exact
-- signature preserves all data and lets the replacement be installed safely.
DROP FUNCTION IF EXISTS public.redeem_loyalty_reward(UUID);

CREATE FUNCTION public.redeem_loyalty_reward(p_reward_id UUID)
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
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('student', 'both')
  ) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_settings FROM public.loyalty_settings WHERE id = TRUE;
  IF v_settings.id IS NULL OR NOT v_settings.enabled THEN RAISE EXCEPTION 'loyalty_disabled'; END IF;

  SELECT * INTO v_reward FROM public.loyalty_rewards WHERE id = p_reward_id AND active = TRUE FOR UPDATE;
  IF v_reward.id IS NULL THEN RAISE EXCEPTION 'reward_not_found'; END IF;

  SELECT * INTO v_product FROM public.products WHERE id = v_reward.product_id FOR UPDATE;
  IF v_product.id IS NULL OR NOT v_product.available OR v_product.stock <= 0 THEN RAISE EXCEPTION 'reward_out_of_stock'; END IF;

  SELECT COALESCE(FLOOR(SUM(total) / v_settings.points_per_currency_unit), 0)::INTEGER
    INTO v_earned_points
    FROM public.orders WHERE user_id = auth.uid() AND payment_status = 'confirmed';

  SELECT COALESCE(SUM(points_spent), 0)::INTEGER
    INTO v_spent_points
    FROM public.loyalty_redemptions
    WHERE user_id = auth.uid() AND status IN ('pending', 'approved', 'fulfilled', 'delivered');

  IF v_earned_points - v_spent_points < v_reward.points_required THEN RAISE EXCEPTION 'insufficient_points'; END IF;

  v_redemption_code := 'RB-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 8));

  INSERT INTO public.loyalty_redemptions (user_id, reward_id, product_id, points_spent, redemption_code, status)
  VALUES (auth.uid(), v_reward.id, v_product.id, v_reward.points_required, v_redemption_code, 'pending')
  RETURNING id INTO v_redemption_id;

  UPDATE public.products
  SET stock = stock - 1, available = CASE WHEN stock <= 1 THEN FALSE ELSE available END
  WHERE id = v_product.id;

  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (auth.uid(), 'reward_redemption', 'Canje enviado para aprobación',
    format('Solicitaste %s. El código se habilitará cuando el administrador apruebe el canje.', v_reward.title));

  RETURN jsonb_build_object('id', v_redemption_id, 'reward_id', v_reward.id,
    'points_spent', v_reward.points_required, 'redemption_code', v_redemption_code,
    'status', 'pending', 'created_at', NOW());
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_loyalty_reward(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_reward(UUID) TO authenticated;
