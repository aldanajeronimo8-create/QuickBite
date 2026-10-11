-- Canonical QuickBite school structure: sections 2/3/4, grades 1–11,
-- and lettered courses A–E. Idempotent so it can restore missing rows without
-- creating duplicates or changing profile assignments.
begin;

insert into public.academic_sections (name, active, display_order)
values
  ('Sección 2', true, 2),
  ('Sección 3', true, 3),
  ('Sección 4', true, 4)
on conflict (name) do update
set active = excluded.active,
    display_order = excluded.display_order,
    updated_at = now();

insert into public.academic_grades (section_id, name, active, display_order)
select s.id, seed.grade_name, true, seed.display_order
from (
  values
    ('Sección 2', '1°', 1),
    ('Sección 2', '2°', 2),
    ('Sección 2', '3°', 3),
    ('Sección 2', '4°', 4),
    ('Sección 2', '5°', 5),
    ('Sección 3', '6°', 6),
    ('Sección 3', '7°', 7),
    ('Sección 3', '8°', 8),
    ('Sección 4', '9°', 9),
    ('Sección 4', '10°', 10),
    ('Sección 4', '11°', 11)
) as seed(section_name, grade_name, display_order)
join public.academic_sections s on s.name = seed.section_name
on conflict (section_id, name) do update
set active = excluded.active,
    display_order = excluded.display_order,
    updated_at = now();

insert into public.academic_courses (grade_id, name, active, display_order)
select g.id, course.name, true, course.display_order
from public.academic_grades g
join public.academic_sections s on s.id = g.section_id
cross join (values ('A', 1), ('B', 2), ('C', 3), ('D', 4), ('E', 5)) as course(name, display_order)
where (s.name = 'Sección 2' and g.name in ('1°', '2°', '3°', '4°', '5°'))
   or (s.name = 'Sección 3' and g.name in ('6°', '7°', '8°'))
   or (s.name = 'Sección 4' and g.name in ('9°', '10°', '11°'))
on conflict (grade_id, name) do update
set active = excluded.active,
    display_order = excluded.display_order,
    updated_at = now();

commit;
