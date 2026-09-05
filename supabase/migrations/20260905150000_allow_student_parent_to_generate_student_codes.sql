-- student_parent is also a student account, so it must be able to generate its family-link code.
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
  if v_role not in ('student','both','student_parent') then raise exception 'student_only'; end if;

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
    update public.profiles set student_code = v_code, updated_at = now() where id = v_user;
    insert into public.family_link_codes(student_user_id, code, expires_at) values(v_user, v_code, v_expires_at);
  else
    update public.profiles set student_code = v_code, updated_at = now() where id = v_user and student_code is distinct from v_code;
  end if;

  return jsonb_build_object('code', v_code, 'expires_at', v_expires_at);
end;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_student_code(boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_student_code(boolean, uuid) TO authenticated;
