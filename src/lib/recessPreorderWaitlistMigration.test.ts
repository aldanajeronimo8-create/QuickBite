import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261019140000_recess_preorder_window_waitlist_and_qr_visibility.sql'),
  'utf8',
);
const capacityMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261016143144_student_recess_capacity_and_schedule_crud.sql'),
  'utf8',
);
const studentMenu = readFileSync(
  join(process.cwd(), 'src/app/pages/student/StudentMenuPage.tsx'),
  'utf8',
);
const recessStatus = readFileSync(
  join(process.cwd(), 'src/app/components/student/StudentRecessStatus.tsx'),
  'utf8',
);

describe('recess preorder window, QR timing and student waitlist', () => {
  it('stores one waitlist entry per student, section schedule and day with explicit lifecycle states', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.recess_waitlist/i);
    expect(migration).toMatch(/UNIQUE \(student_user_id, recess_schedule_id, pickup_date\)/i);
    expect(migration).toMatch(/'waiting', 'offered', 'accepted', 'expired', 'cancelled'/i);
    expect(migration).toMatch(/REVOKE ALL ON public\.recess_waitlist FROM anon, authenticated/i);
    expect(migration).toMatch(/CREATE POLICY recess_waitlist_read_own[\s\S]*?student_user_id = auth\.uid\(\) OR public\.is_admin\(\)/i);
  });

  it('offers released places in FIFO order for five minutes and advances when the offer expires', () => {
    expect(migration).toMatch(/ORDER BY created_at, id[\s\S]*?LIMIT 1\s+FOR UPDATE/i);
    expect(migration).toMatch(/offer_expires_at = v_now \+ interval '5 minutes'/i);
    expect(migration).toMatch(/offer_expires_at <= v_now[\s\S]*?status = 'expired'/i);
    expect(migration).toMatch(/CREATE TRIGGER refresh_recess_waitlist_after_order_change[\s\S]*?AFTER INSERT OR UPDATE OR DELETE ON public\.orders/i);
  });

  it('does not let another student take an offered place or exceed the distinct-student cap', () => {
    expect(migration).toMatch(/CREATE TRIGGER guard_recess_waitlist_offer[\s\S]*?BEFORE INSERT ON public\.orders/i);
    expect(migration).toMatch(/RAISE EXCEPTION 'recess_waitlist_offer_pending'/i);
    expect(migration).toMatch(/RAISE EXCEPTION 'recess_student_limit_reached'/i);
    expect(capacityMigration).toMatch(/count\(DISTINCT o\.user_id\)/i);
    expect(capacityMigration).toMatch(/IF NOT v_student_has_existing_order AND v_students_count >= v_max_students THEN\s+RAISE EXCEPTION 'recess_student_limit_reached'/i);
  });

  it('returns open-window and queue information and restricts queue RPCs to authenticated callers', () => {
    expect(migration).toMatch(/window_open boolean/i);
    expect(migration).toMatch(/waitlist_status text/i);
    expect(migration).toMatch(/waitlist_position bigint/i);
    expect(migration).toMatch(/offer_expires_at timestamptz/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.join_student_recess_waitlist/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.leave_student_recess_waitlist/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.join_student_recess_waitlist\(uuid, date\) FROM PUBLIC, anon/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.join_student_recess_waitlist\(uuid, date\) TO authenticated/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.leave_student_recess_waitlist\(uuid, date\) FROM PUBLIC, anon/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.leave_student_recess_waitlist\(uuid, date\) TO authenticated/i);
    expect(migration).toMatch(/v_now_time >= v_schedule\.end_time[\s\S]*?RAISE EXCEPTION 'recess_window_closed'/i);
  });

  it('shows students their preorder list and withholds each preorder QR until the scheduled start', () => {
    expect(studentMenu).toMatch(/function PreorderedOrdersPanel/);
    expect(studentMenu).toMatch(/Tus pedidos preordenados/);
    expect(studentMenu).toMatch(/function RecessWaitlistNotice/);
    expect(studentMenu).toMatch(/join_student_recess_waitlist/);
    expect(studentMenu).toMatch(/leave_student_recess_waitlist/);
    expect(studentMenu).toMatch(/const preorderStarted = !order\.preordered[\s\S]*?now >= Date\.parse\(order\.scheduled_for\)/);
    expect(studentMenu).toMatch(/order\.status !== 'delivered' && !cancelled && preorderStarted/);
    expect(studentMenu).toMatch(/setInterval\(\(\) => \{\s*const current = Date\.now\(\);/);
    expect(studentMenu).toMatch(/QR se habilitará automáticamente al comenzar el descanso/i);
  });

  it('uses readable contrast for both active and upcoming recess state', () => {
    expect(recessStatus).toMatch(/bg-emerald-50 dark:bg-emerald-500\/10/);
    expect(recessStatus).toMatch(/text-emerald-900 dark:text-emerald-200/);
    expect(recessStatus).toMatch(/Próximo: <span className="font-bold text-slate-950 dark:text-white">/);
  });
});
