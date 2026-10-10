-- Prevent notification fan-out to stale administrator profiles.
-- Historical profiles can remain after their Auth user is removed. They must not
-- receive persistent notifications: this was multiplying each audit event into
-- many orphan rows and consuming database storage.
CREATE OR REPLACE FUNCTION public.fanout_admin_notification_from_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, auth
AS $$
DECLARE
  v_section TEXT;
  v_copy RECORD;
BEGIN
  v_section := public.admin_notification_section(NEW.module);
  SELECT * INTO v_copy
  FROM public.admin_notification_copy(
    NEW.action,
    COALESCE(NEW.metadata, '{}'::jsonb),
    v_section
  )
  LIMIT 1;

  INSERT INTO public.admin_notifications(
    admin_user_id, section, title, body, entity_type, entity_id, metadata
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
  JOIN auth.users u ON u.id = p.id
  WHERE p.role IN ('admin', 'both')
    AND p.id <> COALESCE(
      NEW.actor_user_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    );

  RETURN NEW;
END;
$$;
