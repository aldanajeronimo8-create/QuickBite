import { appConfig } from '../config/appConfig';
import { requireSupabaseClient } from '../lib/supabase';
import type { Order } from '../lib/supabase';

export interface ActiveSalesExportResult { count: number; batchId: string; }
export interface WeeklyOrderExportResult extends ActiveSalesExportResult { fileName: string; weekStartIso: string; }
export interface CsvSalesExportResult { count: number; fileName: string; }

const csvHeaders = [
  'Número de pedido',
  'Fecha de creación',
  'Cliente',
  'Correo',
  'Documento',
  'Estado del pedido',
  'Estado del pago',
  'Método de pago',
  'Total del pedido',
  'Código de recogida',
  'Minutos estimados',
  'Referencia de pago',
  'Producto',
  'Categoría',
  'Precio unitario',
  'Cantidad',
  'Subtotal',
  'Stock actual',
];

function csvCell(value: unknown) {
  if (value === null || value === undefined) return '';
  return `"${String(value).replace(/"/g, '""')}"`;
}

function activeOrders(orders: Order[]) {
  return orders.filter((order) => !order.admin_hidden);
}

/** Builds a UTF-8 CSV that Google Sheets can import without any external integration. */
export function buildActiveSalesCsv(orders: Order[]) {
  const sales = activeOrders(orders);
  if (!sales.length) throw new Error('No hay ventas activas para descargar.');

  const rows = sales.flatMap((order) => {
    const items = order.order_items?.length ? order.order_items : [undefined];
    return items.map((item) => [
      order.order_number,
      order.created_at,
      order.user?.full_name,
      order.user?.email,
      order.user?.ti,
      order.status,
      order.payment_status,
      order.payment_method,
      order.total,
      order.pickup_code,
      order.estimated_minutes,
      order.payment_reference,
      item?.product?.name,
      item?.product?.category?.name,
      item?.price,
      item?.quantity,
      item ? item.price * item.quantity : undefined,
      item?.product?.stock,
    ]);
  });

  return [csvHeaders, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
}

export function downloadActiveSalesCsv(orders: Order[]): CsvSalesExportResult {
  const sales = activeOrders(orders);
  const csv = `\uFEFF${buildActiveSalesCsv(orders)}`;
  const fileName = `quickbite-ventas-${new Date().toISOString().slice(0, 10)}.csv`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return { count: sales.length, fileName };
}

function exportEndpoint() {
  const baseUrl = appConfig.apiBaseUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('La exportación a Google Sheets no está configurada.');
  return `${baseUrl}/api/export-google-sheets`;
}

function errorForStatus(status: number) {
  if (status === 401 || status === 403) return 'No tienes autorización para realizar esta operación.';
  if (status >= 500) return 'No fue posible conectar con el servicio de Google Sheets. Las ventas no fueron reiniciadas.';
  return 'No fue posible enviar las ventas a Google Sheets. Las ventas no fueron reiniciadas.';
}

export async function exportActiveSalesToGoogleSheets(): Promise<ActiveSalesExportResult> {
  const { data, error } = await requireSupabaseClient().auth.getSession();
  if (error || !data.session?.access_token) throw new Error('No tienes autorización para realizar esta operación.');
  let response: Response;
  try {
    response = await fetch(exportEndpoint(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch {
    throw new Error('No fue posible conectar con el servicio de Google Sheets. Las ventas no fueron reiniciadas.');
  }
  let payload: { count?: unknown; batchId?: unknown } | null = null;
  try { payload = (await response.json()) as { count?: unknown; batchId?: unknown }; } catch { /* invalid response */ }
  if (!response.ok) throw new Error(errorForStatus(response.status));
  const count = Number(payload?.count);
  const batchId = typeof payload?.batchId === 'string' ? payload.batchId : '';
  if (!Number.isInteger(count) || count < 0 || !batchId) {
    throw new Error('No fue posible enviar las ventas a Google Sheets. Las ventas no fueron reiniciadas.');
  }
  return { count, batchId };
}

/** @deprecated Kept for compatibility; it now exports active sales to Google Sheets. */
export async function exportWeeklyOrdersToExcel(): Promise<WeeklyOrderExportResult> {
  const result = await exportActiveSalesToGoogleSheets();
  return { ...result, fileName: '', weekStartIso: new Date().toISOString() };
}

/** @deprecated Kept for compatibility; no local Excel file is generated. */
export const exportOrdersToExcel = exportWeeklyOrdersToExcel;
