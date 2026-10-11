-- Restrict the powerful "all" role to the four explicitly approved QuickBite accounts.
-- Also keep first-access accounts out of privileged APIs until their initial password is rotated.
CREATE OR REPLACE FUNCTION public.can_use_protected_account()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'quickbite_must_change_password', 'false') <> 'true';
$function$;

CREATE OR REPLACE FUNCTION public.enforce_protected_all_role_allowlist()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.role = 'all'
     AND lower(trim(COALESCE(NEW.email, ''))) NOT IN (
       'aldana.jeronimo@maximino.edu.co',
       'colmenares.juan@maximino.edu.co',
       'useche.diego@maximino.edu.co',
       'fernandez.gabriel@maximino.edu.co'
     ) THEN
    RAISE EXCEPTION 'all_role_reserved_for_protected_accounts'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_restrict_all_role_to_allowlist ON public.profiles;
CREATE TRIGGER profiles_restrict_all_role_to_allowlist
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_protected_all_role_allowlist();

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.can_use_protected_account()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'both', 'all')
        AND active = true
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.can_use_protected_account()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('staff', 'all')
        AND active = true
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_linked_parent(p_student_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.can_use_protected_account()
    AND EXISTS (
      SELECT 1
      FROM public.parent_student_links l
      WHERE l.parent_user_id = auth.uid()
        AND l.student_user_id = p_student_user_id
        AND l.active = true
    );
$function$;

CREATE OR REPLACE FUNCTION public.get_parent_active_student()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT (
    SELECT c.student_user_id
    FROM public.parent_active_student_context c
    JOIN public.parent_student_links l
      ON l.parent_user_id = c.parent_user_id
     AND l.student_user_id = c.student_user_id
     AND l.active = true
    WHERE c.parent_user_id = auth.uid()
      AND public.can_use_protected_account()
    LIMIT 1
  );
$function$;

CREATE OR REPLACE FUNCTION public.set_parent_active_student(p_student_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_use_protected_account() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('parent', 'both', 'all')
      AND active = true
  ) THEN
    RAISE EXCEPTION 'parent_role_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.parent_student_links
    WHERE parent_user_id = auth.uid()
      AND student_user_id = p_student_user_id
      AND active = true
  ) THEN
    RAISE EXCEPTION 'student_not_linked';
  END IF;

  INSERT INTO public.parent_active_student_context(parent_user_id, student_user_id, updated_at)
  VALUES (auth.uid(), p_student_user_id, now())
  ON CONFLICT (parent_user_id) DO UPDATE
    SET student_user_id = excluded.student_user_id,
        updated_at = excluded.updated_at;
  RETURN p_student_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.link_parent_to_student(
  p_student_code text,
  p_relationship text DEFAULT 'Acudiente'::text
)
RETURNS public.parent_student_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent uuid := auth.uid();
  v_student uuid;
  v_code_id uuid;
  v_link public.parent_student_links;
  v_parent_count integer;
  v_student_parent_count integer;
  v_relationship text := nullif(trim(p_relationship), '');
BEGIN
  IF v_parent IS NULL OR NOT public.can_use_protected_account() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_parent
      AND role IN ('parent', 'student_parent', 'all')
      AND active = true
  ) THEN
    RAISE EXCEPTION 'parent_role_required';
  END IF;
  IF v_relationship IS NULL THEN v_relationship := 'Acudiente'; END IF;
  IF v_relationship NOT IN ('Padre','Madre','Acudiente','Tutor legal','Abuelo/a','Tío/a','Hermano/a','Familiar','Otro') THEN
    RAISE EXCEPTION 'invalid_relationship';
  END IF;

  SELECT id, student_user_id INTO v_code_id, v_student
  FROM public.family_link_codes
  WHERE code = upper(trim(p_student_code))
    AND used_at IS NULL
    AND expires_at > now()
  FOR UPDATE;
  IF v_code_id IS NULL THEN RAISE EXCEPTION 'invalid_or_expired_student_code'; END IF;
  IF v_student = v_parent THEN RAISE EXCEPTION 'invalid_family_link'; END IF;

  SELECT count(*) INTO v_student_parent_count
  FROM public.parent_student_links
  WHERE student_user_id = v_student AND active = true AND parent_user_id <> v_parent;
  IF v_student_parent_count >= 2 THEN RAISE EXCEPTION 'student_parent_limit_reached'; END IF;

  SELECT count(*) INTO v_parent_count
  FROM public.parent_student_links
  WHERE parent_user_id = v_parent AND active = true AND student_user_id <> v_student;
  IF v_parent_count >= 4 THEN RAISE EXCEPTION 'parent_child_limit_reached'; END IF;

  INSERT INTO public.parent_student_links(parent_user_id, student_user_id, relationship, active)
  VALUES (v_parent, v_student, v_relationship, true)
  ON CONFLICT (parent_user_id, student_user_id)
  DO UPDATE SET relationship = excluded.relationship, active = true
  RETURNING * INTO v_link;

  UPDATE public.family_link_codes
  SET used_at = now(), used_by_parent_user_id = v_parent
  WHERE id = v_code_id;
  RETURN v_link;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_or_create_student_code(
  p_force_new boolean DEFAULT false,
  p_student_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_user uuid := coalesce(p_student_user_id, v_actor);
  v_role text;
  v_email text;
  v_code text;
  v_expires_at timestamptz;
  v_seed text;
  v_protected boolean := false;
BEGIN
  IF v_actor IS NULL OR NOT public.can_use_protected_account() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT role, lower(email) INTO v_role, v_email
  FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'student_not_found'; END IF;

  IF v_user <> v_actor AND NOT public.is_linked_parent(v_user) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_role NOT IN ('student', 'both', 'student_parent', 'all') THEN
    RAISE EXCEPTION 'student_only';
  END IF;

  v_protected := public.is_protected_admin_email(v_email);

  IF NOT coalesce(p_force_new, false) THEN
    SELECT flc.code, flc.expires_at INTO v_code, v_expires_at
    FROM public.family_link_codes flc
    WHERE flc.student_user_id = v_user
      AND flc.used_at IS NULL
      AND flc.expires_at > now()
    ORDER BY flc.created_at DESC
    LIMIT 1;
  END IF;

  IF v_code IS NULL THEN
    LOOP
      v_seed := md5(v_user::text || clock_timestamp()::text || random()::text);
      v_code := 'QB-' || upper(substr(v_seed, 1, 8));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE student_code = v_code)
        AND NOT EXISTS (SELECT 1 FROM public.family_link_codes WHERE code = v_code);
    END LOOP;

    v_expires_at := now() + interval '30 days';
    IF NOT v_protected THEN
      UPDATE public.profiles SET student_code = v_code, updated_at = now() WHERE id = v_user;
    END IF;

    INSERT INTO public.family_link_codes(student_user_id, code, expires_at)
    VALUES (v_user, v_code, v_expires_at);
  ELSIF NOT v_protected THEN
    UPDATE public.profiles
    SET student_code = v_code, updated_at = now()
    WHERE id = v_user AND student_code IS DISTINCT FROM v_code;
  END IF;

  RETURN jsonb_build_object('code', v_code, 'expires_at', v_expires_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_loyalty_reward(p_reward_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_settings public.loyalty_settings%rowtype;
  v_reward public.loyalty_rewards%rowtype;
  v_product public.products%rowtype;
  v_redemption_id uuid;
  v_redemption_code text;
  v_earned_points integer;
  v_spent_points integer;
  v_user uuid := public.effective_student_user_id();
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.can_use_protected_account()
    OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user AND role IN ('student', 'both', 'all')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_settings FROM public.loyalty_settings WHERE id = true;
  IF v_settings.id IS NULL OR NOT v_settings.enabled THEN RAISE EXCEPTION 'loyalty_disabled'; END IF;
  SELECT * INTO v_reward FROM public.loyalty_rewards WHERE id = p_reward_id AND active = true FOR UPDATE;
  IF v_reward.id IS NULL THEN RAISE EXCEPTION 'reward_not_found'; END IF;
  SELECT * INTO v_product FROM public.products WHERE id = v_reward.product_id FOR UPDATE;
  IF v_product.id IS NULL OR NOT v_product.available OR v_product.stock <= 0 THEN RAISE EXCEPTION 'reward_out_of_stock'; END IF;

  SELECT coalesce(sum(points), 0)::integer INTO v_earned_points FROM public.loyalty_point_ledger WHERE user_id = v_user;
  SELECT coalesce(sum(points_spent), 0)::integer INTO v_spent_points
  FROM public.loyalty_redemptions
  WHERE user_id = v_user AND status IN ('pending', 'approved', 'fulfilled', 'delivered');
  IF v_earned_points - v_spent_points < v_reward.points_required THEN RAISE EXCEPTION 'insufficient_points'; END IF;

  v_redemption_code := 'RB-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
  INSERT INTO public.loyalty_redemptions(user_id, reward_id, product_id, points_spent, redemption_code, status)
  VALUES (v_user, v_reward.id, v_product.id, v_reward.points_required, v_redemption_code, 'pending')
  RETURNING id INTO v_redemption_id;
  UPDATE public.products
  SET stock = stock - 1, available = CASE WHEN stock <= 1 THEN false ELSE available END
  WHERE id = v_product.id;
  INSERT INTO public.notifications(user_id, type, title, body)
  VALUES (v_user, 'reward_redemption', 'Canje enviado para aprobación',
          format('Solicitaste %s. El código se habilitará cuando el administrador apruebe el canje.', v_reward.title));
  RETURN jsonb_build_object('id', v_redemption_id, 'reward_id', v_reward.id,
    'points_spent', v_reward.points_required, 'redemption_code', v_redemption_code,
    'status', 'pending', 'created_at', now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.link_student_by_code(
  p_student_code text,
  p_relationship text DEFAULT 'acudiente'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student uuid;
  v_link uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_use_protected_account() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('parent', 'both', 'student_parent', 'all')
      AND active = true
  ) THEN
    RAISE EXCEPTION 'parent_role_required';
  END IF;

  SELECT id INTO v_student
  FROM public.profiles
  WHERE student_code = trim(p_student_code)
    AND role IN ('student', 'both', 'student_parent')
    AND active = true;
  IF v_student IS NULL THEN RAISE EXCEPTION 'student_code_not_found'; END IF;
  IF v_student = auth.uid() THEN RAISE EXCEPTION 'cannot_link_self'; END IF;

  INSERT INTO public.parent_student_links(parent_user_id, student_user_id, relationship, active)
  VALUES (auth.uid(), v_student, coalesce(nullif(trim(p_relationship), ''), 'acudiente'), true)
  ON CONFLICT DO NOTHING RETURNING id INTO v_link;
  IF v_link IS NULL THEN
    SELECT id INTO v_link FROM public.parent_student_links
    WHERE parent_user_id = auth.uid() AND student_user_id = v_student;
  END IF;
  RETURN v_link;
END;
$function$;
