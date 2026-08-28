import { describe, expect, it } from 'vitest';
import type { Order } from '../lib/supabase';
import { buildActiveSalesWorkbook } from './orderExportService';

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

describe('buildActiveSalesWorkbook', () => {
  it('creates a structured workbook with sales, product detail, and purchase time', () => {
    const workbook = buildActiveSalesWorkbook([order]);

    expect(workbook.SheetNames).toEqual(['Resumen', 'Ventas', 'Detalle de productos']);
    expect(workbook.Sheets.Ventas.C6.v).toBe('07:00');
    expect(workbook.Sheets.Ventas.D6.v).toBe('Ana "Pérez"');
    expect(workbook.Sheets['Detalle de productos'].D6.v).toBe('Empanada, queso');
    expect(workbook.Sheets.Ventas['!autofilter']).toEqual({ ref: 'A5:O6' });
    expect(workbook.Sheets.Resumen.A6.f).toBe("SUM('Ventas'!L6:L6)");
  });

  it('includes archived sales to preserve the complete closing-period history', () => {
    const workbook = buildActiveSalesWorkbook([{ ...order, admin_hidden: true }]);

    expect(workbook.Sheets.Ventas.A6.v).toBe('QB-001');
    expect(workbook.Sheets.Resumen.B6.f).toBe("COUNTA('Ventas'!A6:A6)");
  });
});
