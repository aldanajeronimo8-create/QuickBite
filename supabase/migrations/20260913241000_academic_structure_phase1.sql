create table if not exists public.academic_sections (
  id uuid primary key default gen_random_uuid(), name text not null unique, active boolean not null default true,
  display_order integer not null default 0 check (display_order >= 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.academic_grades (
  id uuid primary key default gen_random_uuid(), section_id uuid not null references public.academic_sections(id) on delete cascade,
  name text not null, active boolean not null default true, display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(section_id, name)
);
create table if not exists public.academic_courses (
  id uuid primary key default gen_random_uuid(), grade_id uuid not null references public.academic_grades(id) on delete cascade,
  name text not null, active boolean not null default true, display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(grade_id, name)
);

alter table public.profiles add column if not exists section_id uuid references public.academic_sections(id) on delete set null;
alter table public.profiles add column if not exists grade_id uuid references public.academic_grades(id) on delete set null;
alter table public.profiles add column if not exists course_id uuid references public.academic_courses(id) on delete set null;

create index if not exists academic_grades_section_id_idx on public.academic_grades(section_id);
create index if not exists academic_courses_grade_id_idx on public.academic_courses(grade_id);
create index if not exists profiles_section_id_idx on public.profiles(section_id);
create index if not exists profiles_grade_id_idx on public.profiles(grade_id);
create index if not exists profiles_course_id_idx on public.profiles(course_id);

alter table public.academic_sections enable row level security;
alter table public.academic_grades enable row level security;
alter table public.academic_courses enable row level security;

drop policy if exists academic_sections_public_read on public.academic_sections;
create policy academic_sections_public_read on public.academic_sections for select using (active = true or public.is_admin());
drop policy if exists academic_grades_public_read on public.academic_grades;
create policy academic_grades_public_read on public.academic_grades for select using (active = true or public.is_admin());
drop policy if exists academic_courses_public_read on public.academic_courses;
create policy academic_courses_public_read on public.academic_courses for select using (active = true or public.is_admin());
drop policy if exists academic_sections_admin_write on public.academic_sections;
create policy academic_sections_admin_write on public.academic_sections for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists academic_grades_admin_write on public.academic_grades;
create policy academic_grades_admin_write on public.academic_grades for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists academic_courses_admin_write on public.academic_courses;
create policy academic_courses_admin_write on public.academic_courses for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.set_academic_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists academic_sections_updated_at on public.academic_sections;
create trigger academic_sections_updated_at before update on public.academic_sections for each row execute function public.set_academic_updated_at();
drop trigger if exists academic_grades_updated_at on public.academic_grades;
create trigger academic_grades_updated_at before update on public.academic_grades for each row execute function public.set_academic_updated_at();
drop trigger if exists academic_courses_updated_at on public.academic_courses;
create trigger academic_courses_updated_at before update on public.academic_courses for each row execute function public.set_academic_updated_at();

insert into public.academic_sections (name, display_order) values ('Sección 1',1),('Sección 2',2),('Sección 3',3),('Sección 4',4) on conflict (name) do nothing;
insert into public.academic_grades (section_id,name,display_order)
select s.id, gs::text || '°', gs from public.academic_sections s cross join generate_series(1,11) gs
where s.name in ('Sección 1','Sección 2','Sección 3','Sección 4') on conflict (section_id,name) do nothing;
insert into public.academic_courses (grade_id,name,display_order)
select g.id, c, ascii(c)-64 from public.academic_grades g cross join (values ('A'),('B'),('C')) v(c)
on conflict (grade_id,name) do nothing;

create or replace function public.create_student_profile_with_consent(
  p_user_id uuid, p_email text, p_full_name text, p_ti text, p_guardian_name text, p_guardian_relationship text,
  p_guardian_email text, p_student_acknowledged boolean, p_guardian_authorized boolean, p_purpose text,
  p_section_id uuid default null, p_grade_id uuid default null, p_course_id uuid default null
) returns public.profiles language plpgsql security definer set search_path = public, auth as $$
declare v_role text := 'student'; begin
  if p_user_id is null or auth.uid() is distinct from p_user_id then raise exception 'not_authorized'; end if;
  if not p_student_acknowledged or not p_guardian_authorized then raise exception 'consent_required'; end if;
  if p_section_id is null or p_grade_id is null or p_course_id is null then raise exception 'academic_structure_required'; end if;
  if not exists (select 1 from public.academic_sections where id=p_section_id and active) then raise exception 'invalid_section'; end if;
  if not exists (select 1 from public.academic_grades where id=p_grade_id and section_id=p_section_id and active) then raise exception 'invalid_grade'; end if;
  if not exists (select 1 from public.academic_courses where id=p_course_id and grade_id=p_grade_id and active) then raise exception 'invalid_course'; end if;
  if exists (select 1 from public.profiles where ti = p_ti and id <> p_user_id) then raise exception 'ti_already_registered'; end if;
  insert into public.profiles(id,email,full_name,role,grade,student_code,ti,section_id,grade_id,course_id,updated_at)
  values (p_user_id,lower(trim(p_email)),trim(p_full_name),v_role,
    (select g.name || ' ' || c.name from public.academic_grades g join public.academic_courses c on c.id=p_course_id where g.id=p_grade_id),
    null,trim(p_ti),p_section_id,p_grade_id,p_course_id,now())
  on conflict (id) do update set email=excluded.email,full_name=excluded.full_name,role='student',ti=excluded.ti,
    section_id=excluded.section_id,grade_id=excluded.grade_id,course_id=excluded.course_id,grade=excluded.grade,updated_at=now();
  insert into public.student_data_consents(user_id,student_name,guardian_name,guardian_relationship,guardian_email,student_acknowledged,guardian_authorized,purpose,consent_at,updated_at)
  values(p_user_id,trim(p_full_name),trim(p_guardian_name),trim(p_guardian_relationship),lower(trim(p_guardian_email)),true,true,p_purpose,now(),now());
  return (select p from public.profiles p where p.id=p_user_id);
end $$;
grant execute on function public.create_student_profile_with_consent(uuid,text,text,text,text,text,text,boolean,boolean,text,uuid,uuid,uuid) to authenticated;
