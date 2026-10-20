-- Parent self-service calls this RPC with an authenticated parent session.
-- Keep it closed to anonymous/public callers; the function body validates auth.uid(),
-- active parent role, account status, one-time code and family-link limits.
REVOKE ALL ON FUNCTION public.link_parent_to_student(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_parent_to_student(text, text) TO authenticated;
