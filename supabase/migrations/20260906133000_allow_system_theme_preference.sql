ALTER TABLE public.user_theme_preferences
  DROP CONSTRAINT IF EXISTS user_theme_preferences_theme_mode_check;

ALTER TABLE public.user_theme_preferences
  ADD CONSTRAINT user_theme_preferences_theme_mode_check
  CHECK (theme_mode IN ('light', 'dark', 'system'));

CREATE OR REPLACE FUNCTION public.set_my_theme_preference(p_theme_mode TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_theme_mode NOT IN ('light','dark','system') THEN
    RAISE EXCEPTION 'invalid_theme_mode';
  END IF;
  INSERT INTO public.user_theme_preferences (user_id, theme_mode, updated_at)
  VALUES (auth.uid(), p_theme_mode, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET theme_mode = EXCLUDED.theme_mode,
        updated_at = NOW();
  RETURN p_theme_mode;
END;
$$;
