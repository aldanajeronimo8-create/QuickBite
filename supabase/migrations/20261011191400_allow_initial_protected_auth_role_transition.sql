CREATE OR REPLACE FUNCTION public.prevent_protected_admin_auth_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND public.is_protected_admin_email(OLD.email)
     AND OLD.email IS NOT DISTINCT FROM NEW.email
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = OLD.id)
     AND (to_jsonb(NEW) - ARRAY['role', 'updated_at'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['role', 'updated_at'])
  THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.allow_protected_admin_maintenance', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' AND public.is_protected_admin_email(OLD.email) THEN
    RAISE EXCEPTION 'protected_account_cannot_be_deleted';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF public.is_protected_admin_email(OLD.email) THEN
      IF EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = OLD.id AND p.role = 'all'
          AND lower(trim(p.email)) = lower(trim(OLD.email))
          AND lower(trim(p.email)) = lower(trim(NEW.email))
      )
        AND COALESCE(OLD.raw_app_meta_data, '{}'::jsonb) ->> 'quickbite_protected_account' = 'true'
        AND COALESCE(OLD.raw_app_meta_data, '{}'::jsonb) ->> 'quickbite_must_change_password' = 'true'
        AND COALESCE(NEW.raw_app_meta_data, '{}'::jsonb) ->> 'quickbite_protected_account' = 'true'
        AND COALESCE(NEW.raw_app_meta_data, '{}'::jsonb) ->> 'quickbite_must_change_password' = 'false'
        AND NULLIF(COALESCE(NEW.raw_app_meta_data, '{}'::jsonb) ->> 'quickbite_first_password_changed_at', '') IS NOT NULL
        AND OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password
        AND (COALESCE(OLD.raw_app_meta_data, '{}'::jsonb) - ARRAY['quickbite_must_change_password', 'quickbite_first_password_changed_at'])
            IS NOT DISTINCT FROM
            (COALESCE(NEW.raw_app_meta_data, '{}'::jsonb) - ARRAY['quickbite_must_change_password', 'quickbite_first_password_changed_at'])
        AND (to_jsonb(NEW) - ARRAY['encrypted_password', 'raw_app_meta_data', 'confirmed_at', 'last_sign_in_at', 'updated_at'])
            IS NOT DISTINCT FROM
            (to_jsonb(OLD) - ARRAY['encrypted_password', 'raw_app_meta_data', 'confirmed_at', 'last_sign_in_at', 'updated_at'])
      THEN
        RETURN NEW;
      END IF;

      IF (to_jsonb(NEW) - ARRAY['confirmed_at', 'last_sign_in_at', 'updated_at'])
         IS DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['confirmed_at', 'last_sign_in_at', 'updated_at']) THEN
        RAISE EXCEPTION 'protected_account_cannot_be_changed';
      END IF;
    END IF;

    IF OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password
      AND auth.uid() = OLD.id
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.id AND role IN ('admin', 'both'))
    THEN
      RAISE EXCEPTION 'administrative_self_password_change_not_allowed';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
