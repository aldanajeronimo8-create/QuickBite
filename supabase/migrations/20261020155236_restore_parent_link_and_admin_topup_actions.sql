-- Restore the RPC permissions required by existing parent and admin workflows.
-- Code validation runs before parent registration, so the response is only a
-- boolean. It is intentionally callable before authentication.
CREATE OR REPLACE FUNCTION public.set_parent_active_student(p_student_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_use_protected_account() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('parent', 'both', 'student_parent', 'all')
      AND active = true
  ) THEN
    RAISE EXCEPTION 'parent_role_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.parent_student_links
    WHERE parent_user_id = auth.uid()
      AND student_user_id = p_student_user_id
      AND active = true
  ) THEN
    RAISE EXCEPTION 'student_not_linked';
  END IF;

  INSERT INTO public.parent_active_student_context(parent_user_id, student_user_id, updated_at)
  VALUES (auth.uid(), p_student_user_id, now())
  ON CONFLICT (parent_user_id) DO UPDATE
    SET student_user_id = EXCLUDED.student_user_id,
        updated_at = EXCLUDED.updated_at;

  RETURN p_student_user_id;
END;
$function$;

-- Keep every SECURITY DEFINER function inaccessible to PUBLIC/anonymous
-- callers unless public account registration explicitly needs it.
REVOKE ALL ON FUNCTION public.validate_student_link_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_student_link_code(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.set_parent_active_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_parent_active_student(uuid) TO authenticated;

-- AdminWalletTopups already supports rejection. Restore EXECUTE for logged-in
-- sessions while retaining the function's own is_admin() authorization check.
REVOKE ALL ON FUNCTION public.reject_wallet_topup(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_wallet_topup(uuid, text) TO authenticated;
