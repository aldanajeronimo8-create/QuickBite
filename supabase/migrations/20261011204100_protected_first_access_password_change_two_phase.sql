CREATE TABLE IF NOT EXISTS public.protected_first_access_attempts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  previous_password_hash text NOT NULL,
  password_changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.protected_first_access_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.protected_first_access_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.protected_first_access_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.begin_protected_first_access_password_change(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_email text;
  v_password_hash text;
  v_app_metadata jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT u.email, u.encrypted_password, COALESCE(u.raw_app_meta_data, '{}'::jsonb)
    INTO v_email, v_password_hash, v_app_metadata
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF NOT FOUND
     OR NOT public.is_protected_admin_email(v_email)
     OR COALESCE(v_app_metadata ->> 'quickbite_protected_account', 'false') <> 'true'
     OR COALESCE(v_app_metadata ->> 'quickbite_must_change_password', 'false') <> 'true'
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = p_user_id
         AND p.role = 'all'
         AND lower(trim(p.email)) = lower(trim(v_email))
     )
     OR COALESCE(v_password_hash, '') = '' THEN
    RAISE EXCEPTION 'protected_first_access_state_invalid' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.protected_first_access_attempts
    (user_id, previous_password_hash, password_changed_at, created_at, expires_at)
  VALUES
    (p_user_id, v_password_hash, NULL, clock_timestamp(), clock_timestamp() + interval '10 minutes')
  ON CONFLICT (user_id) DO UPDATE
    SET previous_password_hash = EXCLUDED.previous_password_hash,
        password_changed_at = NULL,
        created_at = EXCLUDED.created_at,
        expires_at = EXCLUDED.expires_at;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.begin_protected_first_access_password_change(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_protected_first_access_password_change(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_protected_admin_auth_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN
  -- Temporary, field-limited allowance for Supabase Auth's initial account creation.
  IF TG_OP = 'UPDATE'
     AND public.is_protected_admin_email(OLD.email)
     AND OLD.email IS NOT DISTINCT FROM NEW.email
     AND OLD.created_at >= statement_timestamp() - INTERVAL '5 minutes'
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = OLD.id)
     AND (
       to_jsonb(NEW) - ARRAY[
         'role', 'updated_at', 'raw_app_meta_data', 'raw_user_meta_data',
         'confirmation_token', 'confirmation_sent_at', 'email_confirmed_at',
         'confirmed_at', 'encrypted_password', 'aud'
       ]
     ) IS NOT DISTINCT FROM (
       to_jsonb(OLD) - ARRAY[
         'role', 'updated_at', 'raw_app_meta_data', 'raw_user_meta_data',
         'confirmation_token', 'confirmation_sent_at', 'email_confirmed_at',
         'confirmed_at', 'encrypted_password', 'aud'
       ]
     )
  THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.allow_protected_admin_maintenance', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' AND public.is_protected_admin_email(OLD.email) THEN
    RAISE EXCEPTION 'protected_account_cannot_be_deleted';
  END IF;

  IF TG_OP = 'UPDATE' AND public.is_protected_admin_email(OLD.email) THEN
    -- Phase 1: change password while flags remain pending, with a valid marker.
    IF EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = OLD.id AND p.role = 'all'
        AND lower(trim(p.email)) = lower(trim(OLD.email))
        AND lower(trim(p.email)) = lower(trim(NEW.email))
    )
      AND COALESCE(OLD.raw_app_meta_data, '{}'::jsonb) ->> 'quickbite_protected_account' = 'true'
      AND COALESCE(OLD.raw_app_meta_data, '{}'::jsonb) ->> 'quickbite_must_change_password' = 'true'
      AND OLD.raw_app_meta_data IS NOT DISTINCT FROM NEW.raw_app_meta_data
      AND OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password
      AND (
        to_jsonb(NEW) - ARRAY[
          'encrypted_password', 'updated_at', 'confirmed_at', 'last_sign_in_at',
          'confirmation_token', 'confirmation_sent_at',
          'email_confirmed_at', 'email_change', 'email_change_token_current',
          'email_change_token_new', 'email_change_sent_at',
          'recovery_token', 'recovery_sent_at',
          'phone_change', 'phone_change_token', 'phone_change_sent_at',
          'reauthentication_token', 'reauthentication_sent_at'
        ]
      ) IS NOT DISTINCT FROM (
        to_jsonb(OLD) - ARRAY[
          'encrypted_password', 'updated_at', 'confirmed_at', 'last_sign_in_at',
          'confirmation_token', 'confirmation_sent_at',
          'email_confirmed_at', 'email_change', 'email_change_token_current',
          'email_change_token_new', 'email_change_sent_at',
          'recovery_token', 'recovery_sent_at',
          'phone_change', 'phone_change_token', 'phone_change_sent_at',
          'reauthentication_token', 'reauthentication_sent_at'
        ]
      )
      AND EXISTS (
        SELECT 1 FROM public.protected_first_access_attempts a
        WHERE a.user_id = OLD.id
          AND a.previous_password_hash = OLD.encrypted_password
          AND a.password_changed_at IS NULL
          AND a.expires_at > clock_timestamp()
      )
    THEN
      UPDATE public.protected_first_access_attempts a
         SET password_changed_at = clock_timestamp()
       WHERE a.user_id = OLD.id
         AND a.previous_password_hash = OLD.encrypted_password
         AND a.password_changed_at IS NULL
         AND a.expires_at > clock_timestamp();
      IF FOUND THEN
        RETURN NEW;
      END IF;
    END IF;

    -- Phase 2: update trusted app_metadata only after phase 1 succeeded.
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
      AND OLD.encrypted_password IS NOT DISTINCT FROM NEW.encrypted_password
      AND (
        COALESCE(OLD.raw_app_meta_data, '{}'::jsonb)
          - ARRAY['quickbite_must_change_password', 'quickbite_first_password_changed_at']
      ) IS NOT DISTINCT FROM (
        COALESCE(NEW.raw_app_meta_data, '{}'::jsonb)
          - ARRAY['quickbite_must_change_password', 'quickbite_first_password_changed_at']
      )
      AND (
        to_jsonb(NEW) - ARRAY['raw_app_meta_data', 'updated_at']
      ) IS NOT DISTINCT FROM (
        to_jsonb(OLD) - ARRAY['raw_app_meta_data', 'updated_at']
      )
      AND EXISTS (
        SELECT 1 FROM public.protected_first_access_attempts a
        WHERE a.user_id = OLD.id
          AND a.password_changed_at IS NOT NULL
          AND a.previous_password_hash IS DISTINCT FROM OLD.encrypted_password
          AND a.expires_at > clock_timestamp()
      )
    THEN
      DELETE FROM public.protected_first_access_attempts WHERE user_id = OLD.id;
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

  IF TG_OP = 'UPDATE'
     AND OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password
     AND auth.uid() = OLD.id
     AND EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = OLD.id AND role IN ('admin', 'both')
     )
  THEN
    RAISE EXCEPTION 'administrative_self_password_change_not_allowed';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
