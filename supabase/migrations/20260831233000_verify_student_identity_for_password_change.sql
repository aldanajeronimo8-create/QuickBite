-- Verify that the authenticated student supplied the T.I. stored on their own profile.
CREATE OR REPLACE FUNCTION public.verify_student_identity(
  p_user_id UUID,
  p_ti TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_ti TEXT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT trim(ti) INTO v_ti
  FROM public.profiles
  WHERE id = p_user_id
    AND role IN ('student', 'both')
  LIMIT 1;

  RETURN v_ti IS NOT NULL
    AND v_ti <> ''
    AND v_ti = trim(COALESCE(p_ti, ''));
END;
$$;

REVOKE ALL ON FUNCTION public.verify_student_identity(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_student_identity(UUID, TEXT) TO authenticated;
