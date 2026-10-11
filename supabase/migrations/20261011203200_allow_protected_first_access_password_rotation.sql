CREATE OR REPLACE FUNCTION public.prevent_protected_admin_auth_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  /*
   * Supabase Auth's initial createUser flow performs internal updates before
   * the profile is inserted. Permit only the narrow, short-lived initial
   * changes for an allowlisted email, while no profile exists and email stays
   * unchanged. All identity fields not belonging to this bootstrap are equal.
   */
  IF TG_OP = 'UPDATE'
     AND public.is_protected_admin_email(OLD.email)
     AND OLD.email IS NOT DISTINCT FROM NEW.email
     AND OLD.created_at >= statement_timestamp() - INTERVAL '5 minutes'
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = OLD.id)
     AND (to_jsonb(NEW) - ARRAY[
       'role', 'updated_at', 'raw_app_meta_data', 'raw_user_meta_data',
       'confirmation_token', 'confirmation_sent_at', 'email_confirmed_at',
       'confirmed_at', 'encrypted_password', 'aud'
     ]) IS NOT DISTINCT FROM
     (to_jsonb(OLD) - ARRAY[
       'role', 'updated_at', 'raw_app_meta_data', 'raw_user_meta_data',
       'confirmation_token', 'confirmation_sent_at', 'email_confirmed_at',
       'confirmed_at', 'encrypted_password', 'aud'
     ])
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
      /*
       * One-time first-access password change.
       * Supabase Auth's admin update also clears/refreshes ancillary auth
       * tokens and timestamps during a password change. Those internal fields
       * are excluded from row equality; identity, email, role, phone, and
       * user_metadata remain immutable. The app_metadata transition itself
       * must be exactly pending=true -> false for the protected role=all user.
       */
      IF EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = OLD.id
          AND p.role = 'all'
          AND lower(trim(p.email)) = lower(trim(OLD.email))
          AND lower(trim(p.email)) = lower(trim(NEW.email))
      )
        AND COALESCE(OLD.raw_app_meta_data, '{}'::jsonb) ->> 'quickbite_protected_account' = 'true'
        AND COALESCE(OLD.raw_app_meta_data, '{}'::jsonb) ->> 'quickbite_must_change_password' = 'true'
        AND COALESCE(NEW.raw_app_meta_data, '{}'::jsonb) ->> 'quickbite_protected_account' = 'true'
        AND COALESCE(NEW.raw_app_meta_data, '{}'::jsonb) ->> 'quickbite_must_change_password' = 'false'
        AND NULLIF(COALESCE(NEW.raw_app_meta_data, '{}'::jsonb) ->> 'quickbite_first_password_changed_at', '') IS NOT NULL
        AND OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password
        AND (COALESCE(OLD.raw_app_meta_data, '{}'::jsonb)
             - ARRAY['quickbite_must_change_password', 'quickbite_first_password_changed_at'])
            IS NOT DISTINCT FROM
            (COALESCE(NEW.raw_app_meta_data, '{}'::jsonb)
             - ARRAY['quickbite_must_change_password', 'quickbite_first_password_changed_at'])
        AND (
          to_jsonb(NEW) - ARRAY[
            'encrypted_password', 'raw_app_meta_data', 'confirmed_at',
            'last_sign_in_at', 'updated_at',
            'confirmation_token', 'confirmation_sent_at',
            'email_confirmed_at', 'email_change', 'email_change_token_current',
            'email_change_token_new', 'email_change_sent_at',
            'recovery_token', 'recovery_sent_at',
            'phone_change', 'phone_change_token', 'phone_change_sent_at',
            'reauthentication_token', 'reauthentication_sent_at'
          ]
        ) IS NOT DISTINCT FROM (
          to_jsonb(OLD) - ARRAY[
            'encrypted_password', 'raw_app_meta_data', 'confirmed_at',
            'last_sign_in_at', 'updated_at',
            'confirmation_token', 'confirmation_sent_at',
            'email_confirmed_at', 'email_change', 'email_change_token_current',
            'email_change_token_new', 'email_change_sent_at',
            'recovery_token', 'recovery_sent_at',
            'phone_change', 'phone_change_token', 'phone_change_sent_at',
            'reauthentication_token', 'reauthentication_sent_at'
          ]
        )
      THEN
        RETURN NEW;
      END IF;

      IF (
        to_jsonb(NEW) - ARRAY['confirmed_at', 'last_sign_in_at', 'updated_at']
      ) IS DISTINCT FROM (
        to_jsonb(OLD) - ARRAY['confirmed_at', 'last_sign_in_at', 'updated_at']
      ) THEN
        RAISE EXCEPTION 'protected_account_cannot_be_changed';
      END IF;
    END IF;

    IF OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password
      AND auth.uid() = OLD.id
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = OLD.id AND role IN ('admin', 'both')
      )
    THEN
      RAISE EXCEPTION 'administrative_self_password_change_not_allowed';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
