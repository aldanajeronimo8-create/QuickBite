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
  it('creates a structured workbook with sales, product detail, purchase time, and redemptions', () => {
    const workbook = buildActiveSalesWorkbook([order]);

    expect(workbook.SheetNames).toEqual(['Resumen', 'Ventas', 'Detalle de productos', 'Canjes']);
    expect(workbook.Sheets.Ventas.C6.v).toBe('07:00');
    expect(workbook.Sheets.Ventas.D6.v).toBe('Ana "Pérez"');
    expect(workbook.Sheets['Detalle de productos'].D6.v).toBe('Empanada, queso');
    expect(workbook.Sheets.Ventas['!autofilter']).toEqual({ ref: 'A5:O6' });
    expect(workbook.Sheets.Resumen.A6.f).toBe("SUMIF('Ventas'!H6:H6,\"Confirmado\",'Ventas'!L6:L6)");
    expect(workbook.Sheets.Resumen.A6.v).toBe(12500);
    expect(workbook.Sheets.Resumen.B6.v).toBe(1);
    expect(workbook.Sheets.Resumen.D6.v).toBe(2);
  });

  it('rejects archived sales because the export is limited to the active closing period', () => {
    expect(() => buildActiveSalesWorkbook([{ ...order, admin_hidden: true }])).toThrow('No hay ventas activas para descargar.');
  });

  it('can include archived orders in the complete period report', () => {
    const workbook = buildActiveSalesWorkbook([{ ...order, admin_hidden: true }], [], { includeHidden: true });
    expect(workbook.Sheets.Ventas.A6.v).toBe('QB-001');
    expect(workbook.Sheets.Resumen.B6.v).toBe(1);
  });

  it('lists rejected payments but excludes them from confirmed-sale KPIs', () => {
    const rejectedOrder = { ...order, id: 'order-2', order_number: 'QB-002', payment_status: 'rejected' as const, status: 'cancelled' as const, total: 9000 };
    const workbook = buildActiveSalesWorkbook([order, rejectedOrder]);
    expect(workbook.Sheets.Ventas.H7.v).toBe('Rechazado');
    expect(workbook.Sheets.Resumen.A6.v).toBe(12500);
    expect(workbook.Sheets.Resumen.B6.v).toBe(2);
    expect(workbook.Sheets.Resumen.D6.v).toBe(2);
  });
});
