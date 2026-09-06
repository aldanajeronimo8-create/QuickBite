CREATE TABLE IF NOT EXISTS public.user_theme_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  theme_mode TEXT NOT NULL DEFAULT 'light' CHECK (theme_mode IN ('light','dark')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.get_my_theme_preference()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT theme_mode FROM public.user_theme_preferences WHERE user_id = auth.uid()), 'light');
$$;

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
  IF p_theme_mode NOT IN ('light','dark') THEN
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

REVOKE ALL ON FUNCTION public.get_my_theme_preference() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_my_theme_preference(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_theme_preference() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_theme_preference(TEXT) TO authenticated;

ALTER TABLE public.user_theme_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_theme_preferences_select_own ON public.user_theme_preferences;
CREATE POLICY user_theme_preferences_select_own
  ON public.user_theme_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_theme_preferences_insert_own ON public.user_theme_preferences;
CREATE POLICY user_theme_preferences_insert_own
  ON public.user_theme_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_theme_preferences_update_own ON public.user_theme_preferences;
CREATE POLICY user_theme_preferences_update_own
  ON public.user_theme_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
