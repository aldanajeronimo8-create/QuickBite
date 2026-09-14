create or replace function public.complete_pending_student_registration() returns public.profiles language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_user record; v_profile public.profiles; v_meta jsonb; v_user_id uuid:=auth.uid(); v_section uuid; v_grade uuid; v_course uuid; v_ti text; v_guardian_email text;
begin
 if v_user_id is null then raise exception 'not_authorized'; end if;
 select id,email,raw_user_meta_data into v_user from auth.users where id=v_user_id;
 if not found then raise exception 'not_authorized'; end if;
 select * into v_profile from public.profiles where id=v_user_id;
 if found and v_profile.section_id is not null and v_profile.grade_id is not null and v_profile.course_id is not null then return v_profile; end if;
 v_meta:=coalesce(v_user.raw_user_meta_data,'{}'::jsonb); v_section:=nullif(v_meta->>'section_id','')::uuid; v_grade:=nullif(v_meta->>'grade_id','')::uuid; v_course:=nullif(v_meta->>'course_id','')::uuid; v_ti:=nullif(trim(v_meta->>'ti'),''); v_guardian_email:=nullif(lower(trim(v_meta->>'guardian_email')),'');
 if v_section is null or v_grade is null or v_course is null or v_ti is null then raise exception 'pending_student_registration_incomplete'; end if;
 if not exists(select 1 from public.academic_sections where id=v_section and active) then raise exception 'invalid_section'; end if;
 if not exists(select 1 from public.academic_grades where id=v_grade and section_id=v_section and active) then raise exception 'invalid_grade'; end if;
 if not exists(select 1 from public.academic_courses where id=v_course and grade_id=v_grade and active) then raise exception 'invalid_course'; end if;
 if exists(select 1 from public.profiles where ti=v_ti and id<>v_user_id) then raise exception 'ti_already_registered'; end if;
 insert into public.profiles(id,email,full_name,role,grade,student_code,ti,section_id,grade_id,course_id,updated_at)
 values(v_user_id,lower(v_user.email),coalesce(nullif(trim(v_meta->>'full_name'),''),lower(v_user.email)),'student',(select g.name||c.name from public.academic_grades g join public.academic_courses c on c.id=v_course where g.id=v_grade),null,v_ti,v_section,v_grade,v_course,now())
 on conflict(id) do update set email=excluded.email,full_name=excluded.full_name,role='student',ti=excluded.ti,section_id=excluded.section_id,grade_id=excluded.grade_id,course_id=excluded.course_id,grade=excluded.grade,updated_at=now();
 if not exists(select 1 from public.student_data_consents where user_id=v_user_id) then
   insert into public.student_data_consents(user_id,student_name,guardian_name,guardian_relationship,guardian_email,student_acknowledged,guardian_authorized,purpose,consent_at,updated_at)
   values(v_user_id,coalesce(nullif(trim(v_meta->>'full_name'),''),lower(v_user.email)),coalesce(nullif(trim(v_meta->>'guardian_name'),''),'Representante'),coalesce(nullif(trim(v_meta->>'guardian_relationship'),''),'Representante'),v_guardian_email,true,true,'Gestionar la cuenta estudiantil, pedidos y pagos de la cafetería, inventario asociado a pedidos, historial de compras, puntos y recompensas, notificaciones operativas y atención de solicitudes de habeas data.',coalesce(nullif(v_meta->>'data_consent_at','')::timestamptz,now()),now());
 end if;
 return (select p from public.profiles p where p.id=v_user_id);
end $$;
revoke execute on function public.complete_pending_student_registration() from public;
revoke execute on function public.complete_pending_student_registration() from anon;
grant execute on function public.complete_pending_student_registration() to authenticated;
