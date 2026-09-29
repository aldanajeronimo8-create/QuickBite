-- Keep issued student link codes valid until they are actually consumed or expire.
-- Generating a new code must not retroactively invalidate a code that was shared.
CREATE OR REPLACE FUNCTION public.get_or_create_student_code(
  p_force_new boolean DEFAULT false,
  p_student_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_actor uuid := auth.uid();
  v_user uuid := coalesce(p_student_user_id, v_actor);
  v_role text;
  v_code text;
  v_expires_at timestamptz;
  v_seed text;
begin
  if v_actor is null then raise exception 'unauthorized'; end if;
  select role into v_role from public.profiles where id = v_user for update;
  if not found then raise exception 'student_not_found'; end if;
  if v_user <> v_actor and not public.is_linked_parent(v_user) and not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  if v_role not in ('student','both') then raise exception 'student_only'; end if;

  if not coalesce(p_force_new,false) then
    select flc.code, flc.expires_at into v_code, v_expires_at
    from public.family_link_codes flc
    where flc.student_user_id = v_user
      and flc.used_at is null
      and flc.expires_at > now()
    order by flc.created_at desc
    limit 1;
  end if;

  if v_code is null then
    loop
      v_seed := md5(v_user::text || clock_timestamp()::text || random()::text);
      v_code := 'QB-' || upper(substr(v_seed,1,8));
      exit when not exists(select 1 from public.profiles where student_code = v_code)
        and not exists(select 1 from public.family_link_codes where code = v_code);
    end loop;
    v_expires_at := now() + interval '30 days';
    update public.profiles
      set student_code = v_code, updated_at = now()
      where id = v_user;
    insert into public.family_link_codes(student_user_id, code, expires_at)
      values(v_user, v_code, v_expires_at);
  else
    update public.profiles
      set student_code = v_code, updated_at = now()
      where id = v_user and student_code is distinct from v_code;
  end if;

  return jsonb_build_object('code', v_code, 'expires_at', v_expires_at);
end;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_student_code(boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_student_code(boolean, uuid) TO authenticated;

-- Restrict the relationship field to the values exposed by the parent registration UI.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'parent_student_links_relationship_check'
      AND conrelid = 'public.parent_student_links'::regclass
  ) THEN
    ALTER TABLE public.parent_student_links
      ADD CONSTRAINT parent_student_links_relationship_check
      CHECK (
        relationship IS NULL
        OR relationship IN (
          'Padre', 'Madre', 'Acudiente', 'Tutor legal',
          'Abuelo/a', 'Tío/a', 'Hermano/a', 'Familiar', 'Otro'
        )
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.link_parent_to_student(
  p_student_code text,
  p_relationship text DEFAULT 'Acudiente'
)
RETURNS public.parent_student_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent uuid := auth.uid();
  v_student uuid;
  v_code_id uuid;
  v_link public.parent_student_links;
  v_parent_count integer;
  v_student_parent_count integer;
  v_relationship text := nullif(trim(p_relationship), '');
BEGIN
  IF v_parent IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_parent AND role IN ('parent','both')) THEN
    RAISE EXCEPTION 'parent_role_required';
  END IF;
  IF v_relationship IS NULL THEN v_relationship := 'Acudiente'; END IF;
  IF v_relationship NOT IN ('Padre','Madre','Acudiente','Tutor legal','Abuelo/a','Tío/a','Hermano/a','Familiar','Otro') THEN
    RAISE EXCEPTION 'invalid_relationship';
  END IF;

  SELECT id, student_user_id
    INTO v_code_id, v_student
  FROM public.family_link_codes
  WHERE code = upper(trim(p_student_code))
    AND used_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF v_code_id IS NULL THEN RAISE EXCEPTION 'invalid_or_expired_student_code'; END IF;
  IF v_student = v_parent THEN RAISE EXCEPTION 'invalid_family_link'; END IF;

  SELECT count(*) INTO v_student_parent_count
  FROM public.parent_student_links
  WHERE student_user_id = v_student AND active = true;
  IF v_student_parent_count >= 2 AND NOT EXISTS (
    SELECT 1 FROM public.parent_student_links
    WHERE student_user_id = v_student AND parent_user_id = v_parent AND active = true
  ) THEN
    RAISE EXCEPTION 'student_parent_limit_reached';
  END IF;

  SELECT count(*) INTO v_parent_count
  FROM public.parent_student_links
  WHERE parent_user_id = v_parent AND active = true;
  IF v_parent_count >= 4 AND NOT EXISTS (
    SELECT 1 FROM public.parent_student_links
    WHERE parent_user_id = v_parent AND student_user_id = v_student AND active = true
  ) THEN
    RAISE EXCEPTION 'parent_child_limit_reached';
  END IF;

  INSERT INTO public.parent_student_links(parent_user_id, student_user_id, relationship, active)
  VALUES(v_parent, v_student, v_relationship, true)
  ON CONFLICT (parent_user_id, student_user_id)
  DO UPDATE SET relationship=excluded.relationship, active=true
  RETURNING * INTO v_link;

  -- Only successful completion consumes the code.
  UPDATE public.family_link_codes
  SET used_at = now(), used_by_parent_user_id = v_parent
  WHERE id = v_code_id;

  RETURN v_link;
END;
$$;

REVOKE ALL ON FUNCTION public.link_parent_to_student(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_parent_to_student(text, text) TO authenticated;
