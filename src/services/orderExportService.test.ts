import { describe, expect, it } from 'vitest';
import type { Order } from '../lib/supabase';
import { buildActiveSalesCsv } from './orderExportService';

const order = {
  id: 'order-1',
  user_id: 'user-1',
  total: 12500,
  status: 'delivered',
  payment_method: 'cash',
  payment_status: 'confirmed',
  order_number: 'QB-001',
  created_at: '2026-08-28T12:00:00.000Z',
  user: { id: 'user-1', email: 'ana@example.com', full_name: 'Ana "Pérez"', ti: '123', role: 'student', created_at: '2026-08-01T00:00:00.000Z' },
  order_items: [
    {
      id: 'item-1',
      order_id: 'order-1',
      product_id: 'product-1',
      quantity: 2,
      price: 6250,
      product: {
        id: 'product-1',
        name: 'Empanada, queso',
        price: 6250,
        category_id: 'category-1',
        stock: 8,
        available: true,
        created_at: '2026-08-01T00:00:00.000Z',
        category: { id: 'category-1', name: 'Snacks', created_at: '2026-08-01T00:00:00.000Z' },
      },
    },
  ],
} satisfies Order;

describe('buildActiveSalesCsv', () => {
  it('exports active sales with one row per product and escaped CSV values', () => {
    const csv = buildActiveSalesCsv([order]);

    expect(csv).toContain('"Número de pedido"');
    expect(csv).toContain('"Ana ""Pérez"""');
    expect(csv).toContain('"Empanada, queso"');
    expect(csv).toContain('"12500"');
  });

  it('does not include hidden sales', () => {
    expect(() => buildActiveSalesCsv([{ ...order, admin_hidden: true }])).toThrow('No hay ventas activas');
  });
});
