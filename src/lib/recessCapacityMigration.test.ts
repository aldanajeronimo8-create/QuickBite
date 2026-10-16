import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261016143144_student_recess_capacity_and_schedule_crud.sql'),
  'utf8',
);
const orderFunction = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.create_order_with_recess_tx'));

describe('recess capacity migration contract', () => {
  it('models capacity per distinct student and keeps repeat orders for an already-counted student valid', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS max_students integer/i);
    expect(migration).toMatch(/CHECK \(max_students IS NULL OR max_students >= 1\)/i);
    expect(orderFunction).toMatch(/count\(DISTINCT o\.user_id\)/i);
    expect(orderFunction).toMatch(/IF NOT v_student_has_existing_order AND v_students_count >= v_max_students THEN\s+RAISE EXCEPTION 'recess_student_limit_reached'/i);
    expect(orderFunction).not.toMatch(/preorder_limit_reached|v_preorders_count/i);
  });

  it('serializes checkout on the selected schedule row to protect the cap from concurrent orders', () => {
    expect(orderFunction).toMatch(/FOR UPDATE OF s/i);
    expect(orderFunction).toMatch(/recess_student_limit_reached/);
  });

  it('restricts schedule CRUD RPCs to authenticated callers and checks administrator authorization', () => {
    expect(migration).toMatch(/IF auth\.uid\(\) IS NULL OR NOT public\.is_admin\(\) THEN\s+RAISE EXCEPTION 'not_authorized'/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.admin_save_weekly_recess_schedule[\s\S]*?FROM PUBLIC, anon/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_save_weekly_recess_schedule[\s\S]*?TO authenticated/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.admin_delete_recess_schedule_group[\s\S]*?FROM PUBLIC, anon/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_delete_recess_schedule_group[\s\S]*?TO authenticated/i);
  });

  it('archives schedules that have orders and physically deletes only groups without order history', () => {
    expect(migration).toMatch(/WHERE o\.scheduled_recess_schedule_id = ANY\(v_ids\)[\s\S]*?UPDATE public\.recess_schedules\s+SET active = false/i);
    expect(migration).toMatch(/DELETE FROM public\.recess_schedule_targets WHERE recess_schedule_id = ANY\(v_ids\)/i);
    expect(migration).toMatch(/DELETE FROM public\.recess_schedules WHERE id = ANY\(v_ids\)/i);
  });
});
