import type { Order } from './supabase';

export type RecessProductionTurn = {
  order_id: string;
  order_number: string;
  recess_schedule_id: string;
  queue_position: number;
  queue_size: number;
  estimated_pickup_at: string | null;
  recess_ends_at: string;
  is_preordered: boolean;
};

function bogotaDateKey(timestamp: number | string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Computes volatile turns from existing orders; it never writes or caches them. */
export function buildRecessProductionTurns(
  orders: Order[],
  now = Date.now(),
): Map<string, RecessProductionTurn> {
  const today = bogotaDateKey(now);
  const groups = new Map<string, Order[]>();

  for (const order of orders) {
    if (
      !order.scheduled_recess_schedule_id ||
      !order.scheduled_for ||
      !order.scheduled_pickup_until ||
      !['pending', 'preparing'].includes(order.status) ||
      order.payment_status !== 'confirmed' ||
      order.pickup_outcome === 'unclaimed' ||
      bogotaDateKey(order.scheduled_for) !== today ||
      Date.parse(order.scheduled_pickup_until) <= now
    ) continue;

    const group = groups.get(order.scheduled_recess_schedule_id) ?? [];
    group.push(order);
    groups.set(order.scheduled_recess_schedule_id, group);
  }

  const turns = new Map<string, RecessProductionTurn>();
  for (const [scheduleId, group] of groups) {
    group.sort((a, b) => {
      const reservationPriority = Number(Boolean(b.preordered)) - Number(Boolean(a.preordered));
      return reservationPriority ||
        Date.parse(a.created_at) - Date.parse(b.created_at) ||
        a.id.localeCompare(b.id);
    });

    const start = Math.max(
      now,
      ...group.map((order) => Date.parse(order.scheduled_for ?? '')),
    );
    const recessEndsAt = group[0].scheduled_pickup_until!;
    let cursor = start;

    group.forEach((order, index) => {
      const duration = Math.max(order.estimated_minutes ?? 10, 1) * 60_000;
      cursor += duration;
      turns.set(order.id, {
        order_id: order.id,
        order_number: order.order_number,
        recess_schedule_id: scheduleId,
        queue_position: index + 1,
        queue_size: group.length,
        estimated_pickup_at: new Date(cursor).toISOString(),
        recess_ends_at: recessEndsAt,
        is_preordered: Boolean(order.preordered),
      });
    });
  }

  return turns;
}
