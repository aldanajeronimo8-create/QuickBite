-- A previous deployment left a seven-argument user-update overload with a
-- confirmation-code parameter. The current administration UI uses the secure
-- six-argument version, and the duplicate defaults made SQL calls ambiguous.
DROP FUNCTION IF EXISTS public.admin_update_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
