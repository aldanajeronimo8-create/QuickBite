create table if not exists public.recess_schedules (
 id uuid primary key default gen_random_uuid(), name text not null, weekday smallint not null check (weekday between 0 and 6),
 start_time time not null, end_time time not null, active boolean not null default true, priority integer not null default 0,
 notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (end_time > start_time)
);
create table if not exists public.recess_schedule_targets (
 id uuid primary key default gen_random_uuid(), recess_schedule_id uuid not null references public.recess_schedules(id) on delete cascade,
 section_id uuid references public.academic_sections(id) on delete cascade, grade_id uuid references public.academic_grades(id) on delete cascade,
 course_id uuid references public.academic_courses(id) on delete cascade, created_at timestamptz not null default now(),
 check (((section_id is not null)::int + (grade_id is not null)::int + (course_id is not null)::int)=1)
);
create index if not exists recess_schedules_weekday_active_idx on public.recess_schedules(weekday,active,start_time);
create index if not exists recess_schedule_targets_schedule_idx on public.recess_schedule_targets(recess_schedule_id);
create index if not exists recess_schedule_targets_scope_idx on public.recess_schedule_targets(section_id,grade_id,course_id);
alter table public.recess_schedules enable row level security; alter table public.recess_schedule_targets enable row level security;
drop policy if exists recess_schedules_read on public.recess_schedules;
create policy recess_schedules_read on public.recess_schedules for select using(active=true or public.is_admin());
drop policy if exists recess_targets_read on public.recess_schedule_targets;
create policy recess_targets_read on public.recess_schedule_targets for select using(exists(select 1 from public.recess_schedules s where s.id=recess_schedule_id and (s.active=true or public.is_admin())));
drop policy if exists recess_schedules_admin_write on public.recess_schedules;
create policy recess_schedules_admin_write on public.recess_schedules for all using(public.is_admin()) with check(public.is_admin());
drop policy if exists recess_targets_admin_write on public.recess_schedule_targets;
create policy recess_targets_admin_write on public.recess_schedule_targets for all using(public.is_admin()) with check(public.is_admin());
create or replace function public.get_student_recess_status() returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare v_student public.profiles%rowtype; v_now timestamp := now() at time zone 'America/Bogota'; v_dow int := extract(dow from v_now); v_minutes int := extract(hour from v_now)::int*60+extract(minute from v_now)::int; v_active jsonb; v_next jsonb;
begin
 select * into v_student from public.profiles where id=auth.uid();
 if not found or v_student.role not in ('student','both') then raise exception 'student_only'; end if;
 select jsonb_build_object('id',q.id,'name',q.name,'start_time',q.start_time,'end_time',q.end_time,'minutes_remaining',greatest(0,(extract(hour from q.end_time)::int*60+extract(minute from q.end_time)::int)-v_minutes),'scope_level',q.scope_level) into v_active from (select s.id,s.name,s.start_time,s.end_time,case when t.course_id is not null then 3 when t.grade_id is not null then 2 else 1 end scope_level from public.recess_schedules s join public.recess_schedule_targets t on t.recess_schedule_id=s.id where s.active and s.weekday=v_dow and ((t.course_id=v_student.course_id) or (t.grade_id=v_student.grade_id and t.course_id is null) or (t.section_id=v_student.section_id and t.grade_id is null and t.course_id is null))) q
 where (extract(hour from q.start_time)::int*60+extract(minute from q.start_time)::int)<=v_minutes and (extract(hour from q.end_time)::int*60+extract(minute from q.end_time)::int)>v_minutes order by q.scope_level desc,q.start_time limit 1;
 select jsonb_build_object('id',q.id,'name',q.name,'start_time',q.start_time,'end_time',q.end_time,'starts_in_minutes',q.starts_in_minutes,'scope_level',q.scope_level) into v_next from (select s.id,s.name,s.start_time,s.end_time,((extract(hour from s.start_time)::int*60+extract(minute from s.start_time)::int)-v_minutes) starts_in_minutes,case when t.course_id is not null then 3 when t.grade_id is not null then 2 else 1 end scope_level from public.recess_schedules s join public.recess_schedule_targets t on t.recess_schedule_id=s.id where s.active and s.weekday=v_dow and ((t.course_id=v_student.course_id) or (t.grade_id=v_student.grade_id and t.course_id is null) or (t.section_id=v_student.section_id and t.grade_id is null and t.course_id is null)) and (extract(hour from s.start_time)::int*60+extract(minute from s.start_time)::int)>v_minutes) q order by q.scope_level desc,q.start_time limit 1;
 return jsonb_build_object('date',v_now::date,'timezone','America/Bogota','is_active',v_active is not null,'active',coalesce(v_active,'null'::jsonb),'next',coalesce(v_next,'null'::jsonb),'student_section_id',v_student.section_id,'student_grade_id',v_student.grade_id,'student_course_id',v_student.course_id);
end $$;
revoke execute on function public.get_student_recess_status() from public,anon;
grant execute on function public.get_student_recess_status() to authenticated;
