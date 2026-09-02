-- Global admin notifications: every audited operation can surface a persistent alert
-- and an unread activity dot on the affected administration section.
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('dashboard','orders','payments','wallet','inventory','menu','verification','users','loyalty','reports','history','system','features')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_user_unread
  ON public.admin_notifications(admin_user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_section_created
  ON public.admin_notifications(section, created_at DESC);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_notifications_select_own ON public.admin_notifications;
CREATE POLICY admin_notifications_select_own
  ON public.admin_notifications FOR SELECT TO authenticated
  USING (admin_user_id = auth.uid() AND public.is_admin());
DROP POLICY IF EXISTS admin_notifications_update_own ON public.admin_notifications;
CREATE POLICY admin_notifications_update_own
  ON public.admin_notifications FOR UPDATE TO authenticated
  USING (admin_user_id = auth.uid() AND public.is_admin())
  WITH CHECK (admin_user_id = auth.uid() AND public.is_admin());
REVOKE ALL ON public.admin_notifications FROM anon;
GRANT SELECT, UPDATE ON public.admin_notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_notification_section(p_module TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  SELECT CASE lower(COALESCE(p_module,''))
    WHEN 'order' THEN 'orders'
    WHEN 'order_item' THEN 'orders'
    WHEN 'orders' THEN 'orders'
    WHEN 'payment' THEN 'payments'
    WHEN 'wallet' THEN 'wallet'
    WHEN 'wallet_topup' THEN 'wallet'
    WHEN 'inventory' THEN 'inventory'
    WHEN 'product' THEN 'inventory'
    WHEN 'menu' THEN 'menu'
    WHEN 'verification' THEN 'verification'
    WHEN 'user' THEN 'users'
    WHEN 'users' THEN 'users'
    WHEN 'loyalty' THEN 'loyalty'
    WHEN 'report' THEN 'reports'
    WHEN 'reports' THEN 'reports'
    WHEN 'system' THEN 'system'
    WHEN 'reset' THEN 'system'
    ELSE 'dashboard'
  END;
$$;

CREATE OR REPLACE FUNCTION public.admin_notification_copy(p_action TEXT, p_metadata JSONB, p_section TEXT)
RETURNS TABLE(title TEXT, body TEXT)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF p_action = 'order_item.cancellation_requested' THEN
    title := 'Nueva solicitud de cancelación';
    body := format(
      '%s · cantidad: %s. Requiere revisión administrativa.',
      COALESCE(p_metadata->>'product_name', 'Producto'),
      COALESCE(p_metadata->>'quantity', '1')
    );
    RETURN NEXT;
  ELSIF p_action = 'order.cancellation_requested' THEN
    title := 'Nueva solicitud de cancelación de pedido';
    body := 'Un estudiante solicitó cancelar un pedido. Revisa la solicitud en Pedidos.';
    RETURN NEXT;
  ELSIF p_action = 'order.cancellation_approved' THEN
    title := 'Cancelación aprobada';
    body := 'Una solicitud de cancelación fue aprobada y quedó registrada.';
    RETURN NEXT;
  ELSIF p_action = 'order.cancellation_rejected' THEN
    title := 'Cancelación rechazada';
    body := 'Una solicitud de cancelación fue rechazada y quedó registrada.';
    RETURN NEXT;
  END IF;

  title := CASE p_section
    WHEN 'orders' THEN 'Actualización en Pedidos'
    WHEN 'payments' THEN 'Actualización en Pagos'
    WHEN 'wallet' THEN 'Actualización en Recargas de saldo'
    WHEN 'inventory' THEN 'Actualización en Inventario'
    WHEN 'menu' THEN 'Actualización en Menú'
    WHEN 'verification' THEN 'Actualización en Verificación'
    WHEN 'users' THEN 'Actualización en Usuarios'
    WHEN 'loyalty' THEN 'Actualización en Puntos y premios'
    WHEN 'reports' THEN 'Actualización en Informes'
    WHEN 'history' THEN 'Actualización en Auditoría'
    WHEN 'system' THEN 'Actualización del Sistema'
    WHEN 'features' THEN 'Actualización en Funciones'
    ELSE 'Nueva actividad en QuickBite'
  END;
  body := format('Se registró la operación %s.', COALESCE(p_action, 'sin especificar'));
  RETURN NEXT;
END;
$$;

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
  SELECT * INTO v_copy FROM public.admin_notification_copy(NEW.action, COALESCE(NEW.metadata, '{}'::jsonb), v_section) LIMIT 1;

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
  WHERE p.role IN ('admin', 'both')
    AND p.id <> COALESCE(NEW.actor_user_id, '00000000-0000-0000-0000-000000000000'::uuid);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_notification_from_system_audit ON public.system_audit_logs;
CREATE TRIGGER trg_admin_notification_from_system_audit
AFTER INSERT ON public.system_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.fanout_admin_notification_from_audit();

CREATE OR REPLACE FUNCTION public.mark_admin_notifications_read(p_section TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, auth
AS $$
DECLARE v_count INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.admin_notifications
  SET read_at = COALESCE(read_at, NOW())
  WHERE admin_user_id = auth.uid()
    AND read_at IS NULL
    AND (p_section IS NULL OR section = p_section);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_admin_notifications_read(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_admin_notifications_read(TEXT) TO authenticated;
