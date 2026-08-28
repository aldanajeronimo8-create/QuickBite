CREATE OR REPLACE FUNCTION public.moderate_loyalty_redemption(p_redemption_id uuid, p_status text)
RETURNS public.loyalty_redemptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_red public.loyalty_redemptions%ROWTYPE;
  v_result public.loyalty_redemptions%ROWTYPE;
BEGIN
  IF v_admin IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_admin AND p.role IN ('admin', 'both', 'administrator')
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_status NOT IN ('approved', 'cancelled') THEN
    RAISE EXCEPTION 'invalid_redemption_status';
  END IF;

  SELECT * INTO v_red
  FROM public.loyalty_redemptions
  WHERE id = p_redemption_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'redemption_not_found';
  END IF;

  IF v_red.status NOT IN ('pending', 'reserved') THEN
    RAISE EXCEPTION 'redemption_already_processed';
  END IF;

  UPDATE public.loyalty_redemptions
  SET status = p_status,
      fulfilled_at = CASE WHEN p_status = 'approved' THEN NOW() ELSE NULL END
  WHERE id = p_redemption_id
  RETURNING * INTO v_result;

  IF p_status = 'cancelled' THEN
    UPDATE public.loyalty_rewards
    SET stock = COALESCE(stock, 0) + 1,
        updated_at = NOW()
    WHERE id = v_red.reward_id;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_loyalty_redemption(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderate_loyalty_redemption(uuid, text) TO authenticated;
