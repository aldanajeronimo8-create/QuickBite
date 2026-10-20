import { describe, expect, it } from 'vitest';
import type { Order } from './supabase';
import { buildRecessProductionTurns } from './recessProductionQueue';

const NOW = Date.parse('2026-10-20T13:00:00.000Z');

function order(overrides: Partial<Order> & Pick<Order, 'id' | 'order_number'>): Order {
  const { id, order_number, ...rest } = overrides;
  return {
    id,
    order_number,
    user_id: 'student-1',
    total: 5000,
    status: 'pending',
    payment_method: 'cash',
    payment_status: 'confirmed',
    created_at: '2026-10-20T12:00:00.000Z',
    scheduled_recess_schedule_id: 'recess-a',
    scheduled_for: '2026-10-20T13:00:00.000Z',
    scheduled_pickup_until: '2026-10-20T14:00:00.000Z',
    estimated_minutes: 5,
    preordered: false,
    pickup_outcome: 'awaiting',
    ...rest,
  };
}

describe('temporary recess production turns', () => {
  it('puts preorders first, then uses FIFO within each group', () => {
    const rows = [
      order({ id: 'newer', order_number: 'QB2', created_at: '2026-10-20T12:10:00.000Z' }),
      order({ id: 'reserved-later', order_number: 'QB3', preordered: true, created_at: '2026-10-20T12:20:00.000Z' }),
      order({ id: 'reserved-first', order_number: 'QB1', preordered: true, created_at: '2026-10-20T12:05:00.000Z' }),
    ];
    const turns = buildRecessProductionTurns(rows, NOW);

    expect(turns.get('reserved-first')?.queue_position).toBe(1);
    expect(turns.get('reserved-later')?.queue_position).toBe(2);
    expect(turns.get('newer')?.queue_position).toBe(3);
    expect(turns.get('newer')?.queue_size).toBe(3);
  });

  it('recalculates estimated pickup using preparation minutes without persisting turns', () => {
    const rows = [
      order({ id: 'first', order_number: 'QB1', estimated_minutes: 5 }),
      order({ id: 'second', order_number: 'QB2', created_at: '2026-10-20T12:01:00.000Z', estimated_minutes: 7 }),
    ];
    const turns = buildRecessProductionTurns(rows, NOW);

    expect(turns.get('first')?.estimated_pickup_at).toBe(new Date(NOW + 5 * 60_000).toISOString());
    expect(turns.get('second')?.estimated_pickup_at).toBe(new Date(NOW + 12 * 60_000).toISOString());
  });

  it('drops turns after the recess ends and ignores unpaid or inactive orders', () => {
    const rows = [
      order({ id: 'active', order_number: 'QB1' }),
      order({ id: 'unpaid', order_number: 'QB2', payment_status: 'pending' }),
      order({ id: 'cancelled', order_number: 'QB3', status: 'cancelled' }),
      order({ id: 'other-day', order_number: 'QB4', scheduled_for: '2026-10-21T13:00:00.000Z' }),
    ];
    expect([...buildRecessProductionTurns(rows, NOW).keys()]).toEqual(['active']);
    expect(buildRecessProductionTurns(rows, Date.parse('2026-10-20T14:00:00.000Z')).size).toBe(0);
  });

  it('keeps the queue independent for each recess', () => {
    const turns = buildRecessProductionTurns([
      order({ id: 'a1', order_number: 'QB1' }),
      order({ id: 'b1', order_number: 'QB2', scheduled_recess_schedule_id: 'recess-b' }),
    ], NOW);

    expect(turns.get('a1')?.queue_size).toBe(1);
    expect(turns.get('b1')?.queue_size).toBe(1);
  });
});
