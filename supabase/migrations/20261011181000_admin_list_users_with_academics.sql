CREATE OR REPLACE FUNCTION public.admin_list_users_with_academics()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  role text,
  ti text,
  created_at timestamptz,
  active boolean,
  section_id uuid,
  grade_id uuid,
  course_id uuid,
  grade text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    auth_user.id,
    lower(auth_user.email)::text,
    COALESCE(
      NULLIF(profile.full_name, ''),
      NULLIF(auth_user.raw_user_meta_data ->> 'full_name', ''),
      split_part(auth_user.email, '@', 1)
    )::text,
    COALESCE(
      profile.role,
      CASE auth_user.raw_user_meta_data ->> 'role'
        WHEN 'admin' THEN 'admin'
        WHEN 'both' THEN 'both'
        WHEN 'all' THEN 'all'
        WHEN 'parent' THEN 'parent'
        WHEN 'staff' THEN 'staff'
        WHEN 'student_parent' THEN 'student_parent'
        ELSE 'student'
      END
    )::text,
    profile.ti,
    auth_user.created_at,
    COALESCE(profile.active, true),
    profile.section_id,
    profile.grade_id,
    profile.course_id,
    profile.grade
  FROM auth.users AS auth_user
  LEFT JOIN public.profiles AS profile ON profile.id = auth_user.id
  WHERE auth_user.deleted_at IS NULL
  ORDER BY auth_user.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_users_with_academics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_users_with_academics() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users_with_academics() TO authenticated;
