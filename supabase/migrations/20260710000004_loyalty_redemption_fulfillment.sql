CREATE OR REPLACE FUNCTION public.admin_fulfill_loyalty_redemption(
  p_redemption_id UUID,
  p_redemption_code TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_redemption public.loyalty_redemptions%ROWTYPE;
  v_reward_title TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_redemption
  FROM public.loyalty_redemptions
  WHERE id = p_redemption_id
  FOR UPDATE;

  IF v_redemption.id IS NULL THEN
    RAISE EXCEPTION 'redemption_not_found';
  END IF;

  IF v_redemption.status <> 'reserved' THEN
    RAISE EXCEPTION 'redemption_not_available';
  END IF;

  IF upper(trim(p_redemption_code)) <> upper(v_redemption.redemption_code) THEN
    RAISE EXCEPTION 'invalid_redemption_code';
  END IF;

  UPDATE public.loyalty_redemptions
  SET status = 'fulfilled', fulfilled_at = NOW()
  WHERE id = v_redemption.id;

  SELECT title INTO v_reward_title FROM public.loyalty_rewards WHERE id = v_redemption.reward_id;

  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (
    v_redemption.user_id,
    'reward_redemption',
    'Canje entregado',
    format('Entregamos tu recompensa %s. Gracias por usar tus puntos.', COALESCE(v_reward_title, ''))
  );

  RETURN v_redemption.id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_fulfill_loyalty_redemption(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_fulfill_loyalty_redemption(UUID, TEXT) TO authenticated;
