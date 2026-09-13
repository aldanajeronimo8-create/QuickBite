-- Align the shared-family parent food-control migration with the applied schema.
-- The shared family contract reuses the canonical parent_food_blocks table and
-- authorization RPCs created immediately before this migration.

create index if not exists idx_parent_food_blocks_student_product
  on public.parent_food_blocks(student_user_id, product_id);

comment on table public.parent_food_blocks is
  'Parent-managed product blocks shared across all active parent accounts linked to a student.';

comment on column public.parent_food_blocks.student_user_id is
  'Student receiving the restriction; the restriction applies regardless of which linked parent set it.';
