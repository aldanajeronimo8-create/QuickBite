-- Stop notification fan-out to orphaned or inactive admin profiles.
-- The previous trigger copied every system audit event to every admin/both
-- profile, even when the profile had no corresponding Supabase Auth account.
-- This caused admin_notifications to grow far beyond the set of usable accounts.

CREATE OR REPLACE FUNCTION public.fanout_admin_notification_from_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_section text;
  v_copy record;
BEGIN
  v_section := public.admin_notification_section(NEW.module);

  SELECT *
    INTO v_copy
  FROM public.admin_notification_copy(
    NEW.action,
    COALESCE(NEW.metadata, '{}'::jsonb),
    v_section
  )
  LIMIT 1;

  INSERT INTO public.admin_notifications(
    admin_user_id,
    section,
    title,
    body,
    entity_type,
    entity_id,
    metadata
  )
  SELECT
    p.id,
    v_section,
    v_copy.title,
    v_copy.body,
    NEW.entity_type,
    NEW.entity_id,
    jsonb_build_object(
      'audit_id', NEW.id,
      'action', NEW.action,
      'actor_id', NEW.actor_user_id,
      'status', NEW.status
    ) || COALESCE(NEW.metadata, '{}'::jsonb)
  FROM public.profiles p
  JOIN auth.users au
    ON au.id = p.id
   AND au.deleted_at IS NULL
   AND (au.banned_until IS NULL OR au.banned_until <= now())
  WHERE p.role IN ('admin', 'both')
    AND p.active IS TRUE
    AND p.id IS DISTINCT FROM NEW.actor_user_id;

  RETURN NEW;
END;
$function$;
