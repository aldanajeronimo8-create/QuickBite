alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role = any (array['admin'::text,'student'::text,'parent'::text,'both'::text]));

drop policy if exists profiles_insert_parent_self on public.profiles;
create policy profiles_insert_parent_self on public.profiles for insert to authenticated with check (id = auth.uid() and role = 'parent');

drop policy if exists parent_student_insert_related on public.parent_student_links;
create policy parent_student_insert_related on public.parent_student_links for insert to authenticated with check (auth.uid() = parent_user_id or auth.uid() = student_user_id);
drop policy if exists parent_student_update_related on public.parent_student_links;
create policy parent_student_update_related on public.parent_student_links for update to authenticated using (auth.uid() = parent_user_id or auth.uid() = student_user_id) with check (auth.uid() = parent_user_id or auth.uid() = student_user_id);
drop policy if exists parent_student_delete_related on public.parent_student_links;
create policy parent_student_delete_related on public.parent_student_links for delete to authenticated using (auth.uid() = parent_user_id or auth.uid() = student_user_id);

create table if not exists public.family_link_codes (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_parent_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists family_link_codes_student_idx on public.family_link_codes(student_user_id, created_at desc);
create index if not exists family_link_codes_code_idx on public.family_link_codes(code);
alter table public.family_link_codes enable row level security;
drop policy if exists family_link_codes_student_select on public.family_link_codes;
create policy family_link_codes_student_select on public.family_link_codes for select to authenticated using (student_user_id = auth.uid());
drop policy if exists family_link_codes_student_insert on public.family_link_codes;
create policy family_link_codes_student_insert on public.family_link_codes for insert to authenticated with check (student_user_id = auth.uid());

create or replace function public.create_parent_profile_with_role(p_user_id uuid, p_email text, p_full_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'not_authorized'; end if;
  insert into public.profiles (id,email,full_name,role) values (p_user_id, lower(trim(p_email)), trim(p_full_name), 'parent')
  on conflict (id) do update set email=excluded.email, full_name=excluded.full_name, role='parent', updated_at=now();
end; $$;
revoke all on function public.create_parent_profile_with_role(uuid,text,text) from public;
grant execute on function public.create_parent_profile_with_role(uuid,text,text) to authenticated;

create or replace function public.link_parent_to_student(p_student_code text, p_relationship text default 'acudiente')
returns public.parent_student_links language plpgsql security definer set search_path = public as $$
declare v_parent uuid := auth.uid(); v_student uuid; v_link public.parent_student_links;
begin
  if v_parent is null then raise exception 'not_authorized'; end if;
  if not exists (select 1 from public.profiles where id=v_parent and role in ('parent','both')) then raise exception 'parent_role_required'; end if;
  select id into v_student from public.profiles where student_code = upper(trim(p_student_code)) and role in ('student','both') limit 1;
  if v_student is null then raise exception 'invalid_student_code'; end if;
  insert into public.parent_student_links(parent_user_id,student_user_id,relationship,active) values(v_parent,v_student,nullif(trim(p_relationship),''),true) on conflict do nothing returning * into v_link;
  if v_link.id is null then select * into v_link from public.parent_student_links where parent_user_id=v_parent and student_user_id=v_student limit 1; end if;
  return v_link;
end; $$;
revoke all on function public.link_parent_to_student(text,text) from public;
grant execute on function public.link_parent_to_student(text,text) to authenticated;
