-- QuickBite: introduce the dedicated cafeteria Staff role.
-- The production database was updated separately with the equivalent final schema.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'student', 'parent', 'staff', 'both', 'student_parent'));

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'both') AND active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'staff' AND active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() OR public.is_staff();
$$;

-- Preserve the existing admin user-management behavior and add staff-only creation.
ALTER FUNCTION public.admin_manage_user(
  uuid, text, text, text, text, text, text, text
) RENAME TO admin_manage_user_legacy;

CREATE OR REPLACE FUNCTION public.admin_manage_user(
  p_user_id UUID DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_password TEXT DEFAULT NULL,
  p_full_name TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'student',
  p_ti TEXT DEFAULT NULL,
  p_student_code TEXT DEFAULT NULL,
  p_relationship TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID := p_user_id;
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_full_name TEXT := trim(COALESCE(p_full_name, ''));
  v_role TEXT := lower(trim(COALESCE(p_role, '')));
  v_password TEXT := COALESCE(p_password, '');
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_role = 'staff' THEN
    IF v_email = '' OR position('@' in v_email) = 0 THEN RAISE EXCEPTION 'invalid_email'; END IF;
    IF v_full_name = '' THEN RAISE EXCEPTION 'full_name_required'; END IF;
    IF p_user_id IS NULL AND length(v_password) < 6 THEN RAISE EXCEPTION 'password_too_short'; END IF;
    IF p_user_id IS NOT NULL AND p_password IS NOT NULL AND v_password <> '' AND length(v_password) < 6 THEN
      RAISE EXCEPTION 'password_too_short';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(email)=v_email AND id<>COALESCE(v_user_id,'00000000-0000-0000-0000-000000000000'::uuid))
       OR EXISTS (SELECT 1 FROM auth.users WHERE lower(email)=v_email AND id<>COALESCE(v_user_id,'00000000-0000-0000-0000-000000000000'::uuid)) THEN
      RAISE EXCEPTION 'email_already_registered';
    END IF;

    IF p_user_id IS NULL THEN
      v_user_id := gen_random_uuid();
      INSERT INTO auth.users (
        instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',v_user_id,'authenticated','authenticated',v_email,
        extensions.crypt(v_password,extensions.gen_salt('bf')),NOW(),
        jsonb_build_object('provider','email','providers',ARRAY['email']),
        jsonb_build_object('full_name',v_full_name,'role','staff'),NOW(),NOW()
      );
      INSERT INTO auth.identities (
        provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at
      ) VALUES (
        v_user_id::text,v_user_id,
        jsonb_build_object('sub',v_user_id::text,'email',v_email,'email_verified',true,'phone_verified',false),
        'email',NOW(),NOW(),NOW()
      ) ON CONFLICT DO NOTHING;
    ELSE
      UPDATE auth.users
      SET email=v_email,
          encrypted_password=CASE WHEN p_password IS NOT NULL AND v_password<>'' THEN extensions.crypt(v_password,extensions.gen_salt('bf')) ELSE encrypted_password END,
          email_confirmed_at=COALESCE(email_confirmed_at,NOW()),
          raw_user_meta_data=COALESCE(raw_user_meta_data,'{}'::jsonb)||jsonb_build_object('full_name',v_full_name,'role','staff'),
          updated_at=NOW()
      WHERE id=v_user_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'auth_user_not_found'; END IF;
      UPDATE auth.identities
      SET identity_data=COALESCE(identity_data,'{}'::jsonb)||jsonb_build_object('email',v_email,'email_verified',true),
          updated_at=NOW()
      WHERE user_id=v_user_id AND provider='email';
    END IF;

    INSERT INTO public.profiles(id,email,full_name,role,ti,active)
    VALUES(v_user_id,v_email,v_full_name,'staff',NULL,true)
    ON CONFLICT(id) DO UPDATE SET
      email=EXCLUDED.email,full_name=EXCLUDED.full_name,role='staff',ti=NULL,updated_at=NOW();

    RETURN v_user_id;
  END IF;

  RETURN public.admin_manage_user_legacy(
    p_user_id,p_email,p_password,p_full_name,p_role,p_ti,p_student_code,p_relationship
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_manage_user(uuid,text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_manage_user(uuid,text,text,text,text,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_manage_user_legacy(uuid,text,text,text,text,text,text,text) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.admin_set_user_active(p_user_id UUID,p_active BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_email TEXT; v_target_role TEXT;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT email,role INTO v_email,v_target_role FROM public.profiles WHERE id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF p_user_id=auth.uid() THEN RAISE EXCEPTION 'cannot_change_own_active_status'; END IF;
  IF NOT p_active AND public.is_protected_admin_email(v_email) THEN RAISE EXCEPTION 'protected_account_cannot_be_deactivated'; END IF;
  UPDATE public.profiles SET active=p_active,updated_at=now() WHERE id=p_user_id;
  IF NOT p_active THEN DELETE FROM auth.sessions WHERE user_id=p_user_id; END IF;
  INSERT INTO public.audit_logs(actor_id,actor_email,action,entity,entity_id,metadata)
  SELECT auth.uid(),au.email,'user.status_change','user',p_user_id::text,
         jsonb_build_object('active',p_active,'target_role',v_target_role)
  FROM auth.users au WHERE au.id=auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_active(UUID,BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_active(UUID,BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_list_active_orders()
RETURNS TABLE(
  id UUID, order_number TEXT, status TEXT, total NUMERIC, payment_method TEXT,
  payment_status TEXT, pickup_code TEXT, estimated_minutes INTEGER, created_at TIMESTAMPTZ,
  student_name TEXT, student_email TEXT, student_comment TEXT, order_items JSONB
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id,o.order_number,o.status,o.total,o.payment_method,o.payment_status,o.pickup_code,
         o.estimated_minutes,o.created_at,COALESCE(p.full_name,'Usuario'),COALESCE(p.email,''),
         o.student_comment,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'id',oi.id,'product_id',oi.product_id,'quantity',oi.quantity,'price',oi.price,
             'product_name',pr.name
           ) ORDER BY oi.created_at)
           FROM public.order_items oi
           LEFT JOIN public.products pr ON pr.id=oi.product_id
           WHERE oi.order_id=o.id
         ),'[]'::jsonb)
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id=o.user_id
  WHERE public.is_staff()
    AND o.admin_hidden=false
    AND o.status IN ('pending','preparing','ready')
  ORDER BY CASE o.status WHEN 'pending' THEN 1 WHEN 'preparing' THEN 2 WHEN 'ready' THEN 3 ELSE 4 END,
           o.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.staff_list_active_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_list_active_orders() TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_update_order_status(p_order_id UUID,p_status TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_order public.orders%ROWTYPE; v_actor_email TEXT; v_title TEXT; v_body TEXT; v_old_status TEXT;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_status NOT IN ('preparing','ready','delivered') THEN RAISE EXCEPTION 'invalid_order_status'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.status='delivered' THEN RAISE EXCEPTION 'delivered_order_immutable'; END IF;
  IF v_order.status='rejected' THEN RAISE EXCEPTION 'rejected_order_immutable'; END IF;

  v_old_status:=v_order.status;
  IF p_status='preparing' AND v_order.status<>'pending' THEN RAISE EXCEPTION 'invalid_order_transition'; END IF;
  IF p_status='ready' AND v_order.status<>'preparing' THEN RAISE EXCEPTION 'invalid_order_transition'; END IF;
  IF p_status='delivered' AND v_order.status<>'ready' THEN RAISE EXCEPTION 'invalid_order_transition'; END IF;

  UPDATE public.orders
  SET status=p_status,updated_at=now(),
      ready_at=CASE WHEN p_status='ready' THEN COALESCE(ready_at,now()) ELSE ready_at END,
      delivered_at=CASE WHEN p_status='delivered' THEN COALESCE(delivered_at,now()) ELSE delivered_at END
  WHERE id=p_order_id;

  SELECT email INTO v_actor_email FROM auth.users WHERE id=auth.uid();
  CASE p_status
    WHEN 'preparing' THEN
      v_title:='Estamos preparando tu pedido';
      v_body:=format('Tu pedido %s ya esta en preparacion.',v_order.order_number);
    WHEN 'ready' THEN
      v_title:='Tu pedido esta listo';
      v_body:=format('Tu pedido %s esta listo para recoger. Codigo: %s.',v_order.order_number,coalesce(v_order.pickup_code,'consulta en caja'));
    WHEN 'delivered' THEN
      v_title:='Pedido entregado';
      v_body:=format('Tu pedido %s fue marcado como entregado.',v_order.order_number);
  END CASE;

  IF v_order.user_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id,order_id,type,title,body)
    VALUES(v_order.user_id,v_order.id,'order_status',v_title,v_body);
  END IF;

  INSERT INTO public.audit_logs(actor_id,actor_email,action,entity,entity_id,metadata)
  VALUES(auth.uid(),v_actor_email,'order.staff_status_change','order',p_order_id::text,
         jsonb_build_object('from',v_old_status,'to',p_status));
  RETURN p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_update_order_status(UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_update_order_status(UUID,TEXT) TO authenticated;
