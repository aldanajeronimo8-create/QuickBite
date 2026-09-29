CREATE OR REPLACE FUNCTION public.protect_quickbite_student_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
BEGIN
  IF lower(coalesce(OLD.email, '')) = lower('quickbitejgf@gmail.com') THEN
    RAISE EXCEPTION 'protected_account_cannot_be_deleted';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS protect_quickbite_student_delete ON public.profiles;
CREATE TRIGGER protect_quickbite_student_delete
BEFORE DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_quickbite_student_account();
