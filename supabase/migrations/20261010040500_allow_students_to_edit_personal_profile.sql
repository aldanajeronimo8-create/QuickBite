create or replace function public.update_student_profile(p_full_name text,p_ti text default null)
returns table(id uuid,full_name text,email text,grade text,ti text,student_code text)
language plpgsql security definer set search_path=public as $$
declare v_user_id uuid:=auth.uid(); v_name text:=nullif(trim(p_full_name),''); v_ti text:=nullif(trim(p_ti),'');
begin
 if v_user_id is null then raise exception 'unauthorized'; end if;
 if v_name is null or length(v_name)<2 or length(v_name)>120 then raise exception 'invalid_full_name'; end if;
 if v_ti is not null and length(v_ti)>30 then raise exception 'invalid_ti'; end if;
 if v_ti is not null and exists(select 1 from public.profiles p where p.id<>v_user_id and upper(trim(coalesce(p.ti,'')))=upper(v_ti)) then raise exception 'ti_already_registered'; end if;
 update public.profiles p set full_name=v_name,ti=v_ti,updated_at=now() where p.id=v_user_id
 returning p.id,p.full_name,p.email,p.grade,p.ti,p.student_code into id,full_name,email,grade,ti,student_code;
 if not found then raise exception 'profile_not_found'; end if;
 return next;
end; $$;
revoke all on function public.update_student_profile(text,text) from public,anon;
grant execute on function public.update_student_profile(text,text) to authenticated;
