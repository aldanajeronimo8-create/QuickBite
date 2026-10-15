-- QuickBite no longer exposes a Staff workspace or Staff accounts.
-- Keep historical staff data out of the live user model and disable its RPC surface.
-- Note: public.staff_roles is an internal mapping for administrator/super-admin access;
-- do not truncate it as part of retiring the separate profiles.role = 'staff' user role.

BEGIN;

CREATE OR REPLACE FUNCTION public.reject_disabled_staff_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF lower(coalesce(NEW.role, '')) = 'staff' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'staff_role_disabled';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_reject_disabled_staff_role ON public.profiles;
CREATE TRIGGER profiles_reject_disabled_staff_role
  BEFORE INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_disabled_staff_role();

DO $block$
DECLARE
  v_routine record;
BEGIN
  FOR v_routine IN
    SELECT p.proname, oidvectortypes(p.proargtypes) AS arg_types
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND left(p.proname, 6) = 'staff_'
      AND p.prokind = 'f'
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
      v_routine.proname,
      v_routine.arg_types
    );
  END LOOP;
END;
$block$;

COMMIT;
