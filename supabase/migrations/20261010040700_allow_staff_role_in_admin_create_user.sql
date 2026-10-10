create or replace function public.admin_create_user(
  p_email text, p_password text, p_full_name text, p_role text default 'student', p_ti text default null
) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $function$
declare v_user_id uuid; v_email text := lower(trim(p_email)); v_role text := lower(trim(p_role));
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  if v_role not in ('admin','student','staff') then raise exception 'invalid_role'; end if;
  if v_email is null or v_email = '' or position('@' in v_email) < 2 then raise exception 'invalid_email'; end if;
  if p_full_name is null or length(trim(p_full_name)) < 2 or length(trim(p_full_name)) > 120 then raise exception 'invalid_full_name'; end if;
  if p_password is null or length(trim(p_password)) < 6 then raise exception 'password_too_short'; end if;
  if v_role = 'student' and (p_ti is null or trim(p_ti) = '') then raise exception 'ti_required'; end if;
  select id into v_user_id from auth.users where lower(email)=v_email limit 1;
  if v_user_id is null then
    v_user_id := gen_random_uuid();
    insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values('00000000-0000-0000-0000-000000000000',v_user_id,'authenticated','authenticated',v_email,
      extensions.crypt(p_password,extensions.gen_salt('bf')),now(),
      jsonb_build_object('provider','email','providers',array['email']),
      jsonb_build_object('full_name',trim(p_full_name),'role',v_role),now(),now());
    insert into auth.identities(provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
    values(v_user_id::text,v_user_id,jsonb_build_object('sub',v_user_id::text,'email',v_email,'email_verified',true,'phone_verified',false),
      'email',now(),now(),now()) on conflict do nothing;
  else
    update auth.users set encrypted_password=extensions.crypt(p_password,extensions.gen_salt('bf')),
      email_confirmed_at=coalesce(email_confirmed_at,now()),
      raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||jsonb_build_object('full_name',trim(p_full_name),'role',v_role),
      updated_at=now() where id=v_user_id;
  end if;
  if p_ti is not null and trim(p_ti)<>'' and exists(select 1 from public.profiles where ti=trim(p_ti) and id<>v_user_id)
    then raise exception 'ti_already_registered'; end if;
  insert into public.profiles(id,email,full_name,role,ti)
  values(v_user_id,v_email,trim(p_full_name),v_role,nullif(trim(coalesce(p_ti,'')),''))
  on conflict(id) do update set email=excluded.email,full_name=excluded.full_name,role=excluded.role,ti=excluded.ti,updated_at=now();
  return v_user_id;
end; $function$;
revoke all on function public.admin_create_user(text,text,text,text,text) from public, anon;
grant execute on function public.admin_create_user(text,text,text,text,text) to authenticated;
