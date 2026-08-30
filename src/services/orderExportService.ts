import { appConfig } from '../config/appConfig';
import { requireSupabaseClient } from '../lib/supabase';
import type { Order } from '../lib/supabase';
import * as XLSX from '@redoper1/xlsx-js-style';

export interface ActiveSalesExportResult { count: number; batchId: string; }
export interface WeeklyOrderExportResult extends ActiveSalesExportResult { fileName: string; weekStartIso: string; }
export interface CsvSalesExportResult { count: number; fileName: string; }
export interface ExcelSalesExportResult { count: number; fileName: string; }

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

const salesHeaders = [
  'N.º pedido', 'Fecha de compra', 'Hora de compra', 'Cliente', 'Correo', 'Documento', 'Estado pedido', 'Estado pago', 'Método de pago',
  'Código recogida', 'Referencia de pago', 'Total pedido', 'Productos', 'Unidades', 'Tiempo estimado (min)',
];
const detailHeaders = [
  'N.º pedido', 'Fecha de compra', 'Hora de compra', 'Producto', 'Categoría', 'Precio unitario', 'Cantidad', 'Subtotal', 'Stock actual', 'Cliente',
];

function csvCell(value: unknown) {
  if (value === null || value === undefined) return '';
  return `"${String(value).replace(/"/g, '""')}"`;
}

function reportOrders(orders: Order[]) {
  // A cierre de período must retain a complete audit trail, including orders
  // that were archived from the operational admin view in a previous period.
  return [...orders];
}

const purchaseDateFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
});
const purchaseTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

const orderStatusLabel: Record<Order['status'], string> = {
  pending: 'Pendiente', preparing: 'En preparación', ready: 'Listo para recoger', delivered: 'Entregado',
};
const paymentStatusLabel: Record<Order['payment_status'], string> = {
  pending: 'Pendiente', confirmed: 'Confirmado', rejected: 'Rechazado',
};
const paymentMethodLabel: Record<Order['payment_method'], string> = {
  nequi: 'Nequi', bancolombia: 'Bancolombia', daviplata: 'Daviplata', 'bre-b': 'Bre-B', bank_keys: 'Llaves bancarias', cash: 'Efectivo',
};

function purchaseDateAndTime(createdAt: string) {
  const value = new Date(createdAt);
  return { date: purchaseDateFormatter.format(value), time: purchaseTimeFormatter.format(value) };
}

function sheetCell(row: number, column: number) {
  return XLSX.utils.encode_cell({ r: row, c: column });
}

const thinBorder = { style: 'thin', color: { rgb: 'D9E2F3' } };
const reportTitleStyle = {
  fill: { fgColor: { rgb: '1E3A8A' } },
  font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
  alignment: { horizontal: 'left', vertical: 'center' },
};
const tableHeaderStyle = {
  fill: { fgColor: { rgb: '14532D' } },
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
};
const bodyStyle = {
  alignment: { vertical: 'center', wrapText: true },
  border: { bottom: thinBorder },
};
const alternateBodyStyle = {
  ...bodyStyle,
  fill: { fgColor: { rgb: 'F5F9FF' } },
};
const kpiLabelStyle = {
  fill: { fgColor: { rgb: 'DBEAFE' } },
  font: { bold: true, color: { rgb: '1E3A8A' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
};
const kpiValueStyle = {
  fill: { fgColor: { rgb: 'EFF6FF' } },
  font: { bold: true, sz: 13, color: { rgb: '0F172A' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
};

function applyReportLayout(
  sheet: XLSX.WorkSheet,
  title: string,
  headers: string[],
  rows: unknown[][],
  columnWidths: number[],
  numberColumns: number[] = [],
) {
  sheet['A1'] = { v: title, t: 's', s: reportTitleStyle };
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
  sheet['!rows'] = [{ hpt: 28 }, { hpt: 19 }, { hpt: 19 }, { hpt: 8 }, { hpt: 34 }];
  sheet['!cols'] = columnWidths.map((wch) => ({ wch }));
  sheet['!autofilter'] = { ref: `A5:${sheetCell(rows.length + 4, headers.length - 1)}` };
  sheet['!freeze'] = { xSplit: 0, ySplit: 5, topLeftCell: 'A6', activePane: 'bottomLeft', state: 'frozen' };

  for (let column = 0; column < headers.length; column += 1) {
    const header = sheetCell(4, column);
    sheet[header] = { v: headers[column], t: 's', s: tableHeaderStyle };
  }
  for (let row = 0; row < rows.length; row += 1) {
    for (let column = 0; column < headers.length; column += 1) {
      const cell = sheetCell(row + 5, column);
      if (!sheet[cell]) sheet[cell] = { v: '', t: 's' };
      sheet[cell].s = row % 2 === 0 ? bodyStyle : alternateBodyStyle;
      if (numberColumns.includes(column)) sheet[cell].z = '"$"#,##0';
    }
  }
}

/** Creates a professional Excel workbook that works in Excel and Google Sheets. */
export function buildActiveSalesWorkbook(orders: Order[]) {
  const sales = reportOrders(orders);
  if (!sales.length) throw new Error('No hay ventas para descargar.');

  const salesRows = sales.map((order) => {
    const purchase = purchaseDateAndTime(order.created_at);
    const totalUnits = order.order_items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
    return [
      order.order_number, purchase.date, purchase.time, order.user?.full_name ?? 'Sin cliente', order.user?.email ?? '', order.user?.ti ?? '',
      orderStatusLabel[order.status], paymentStatusLabel[order.payment_status], paymentMethodLabel[order.payment_method],
      order.pickup_code ?? '', order.payment_reference ?? '', Number(order.total), order.order_items?.length ?? 0, totalUnits, order.estimated_minutes ?? '',
    ];
  });
  const detailRows = sales.flatMap((order) => {
    const purchase = purchaseDateAndTime(order.created_at);
    return (order.order_items ?? []).map((item) => [
      order.order_number, purchase.date, purchase.time, item.product?.name ?? 'Producto no disponible', item.product?.category?.name ?? 'Sin categoría',
      Number(item.price), item.quantity, Number(item.price) * item.quantity, item.product?.stock ?? '', order.user?.full_name ?? 'Sin cliente',
    ]);
  });

  const earliestOrder = sales.reduce((earliest, order) => new Date(order.created_at) < new Date(earliest.created_at) ? order : earliest, sales[0]);
  const latestOrder = sales.reduce((latest, order) => new Date(order.created_at) > new Date(latest.created_at) ? order : latest, sales[0]);
  const workbook = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet([
    ['QuickBite | Reporte profesional de ventas'],
    ['Periodo incluido', `${purchaseDateAndTime(earliestOrder.created_at).date} a ${purchaseDateAndTime(latestOrder.created_at).date}`],
    ['Generado el', new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', hour12: false })],
    [],
    ['Total facturado', 'Pedidos exportados', 'Ticket promedio', 'Unidades vendidas'],
    [null, null, null, null],
    [],
    ['Guía de uso'],
    ['El archivo contiene una hoja de ventas por pedido y una hoja de detalle por producto. Usa los filtros de las tablas para analizar fechas, horas, pagos o productos.'],
  ]);
  const salesSheet = XLSX.utils.aoa_to_sheet([[], [], [], [], salesHeaders, ...salesRows]);
  const detailsSheet = XLSX.utils.aoa_to_sheet([[], [], [], [], detailHeaders, ...detailRows]);

  summary['A1'] = { v: 'QuickBite | Reporte profesional de ventas', t: 's', s: reportTitleStyle };
  summary['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 7, c: 0 }, e: { r: 7, c: 3 } },
    { s: { r: 8, c: 0 }, e: { r: 8, c: 3 } },
  ];
  summary['!cols'] = [{ wch: 25 }, { wch: 23 }, { wch: 23 }, { wch: 23 }];
  summary['!rows'] = [{ hpt: 30 }, { hpt: 20 }, { hpt: 20 }, { hpt: 10 }, { hpt: 28 }, { hpt: 32 }, { hpt: 10 }, { hpt: 22 }, { hpt: 36 }];
  for (let column = 0; column < 4; column += 1) {
    summary[sheetCell(4, column)] = { v: ['Total facturado', 'Pedidos exportados', 'Ticket promedio', 'Unidades vendidas'][column], t: 's', s: kpiLabelStyle };
    summary[sheetCell(5, column)] = { t: 'n', s: kpiValueStyle };
  }
  summary.A6.f = `SUM('Ventas'!L6:L${salesRows.length + 5})`;
  summary.A6.z = '"$"#,##0';
  summary.B6.f = `COUNTA('Ventas'!A6:A${salesRows.length + 5})`;
  summary.C6.f = 'IFERROR(A6/B6,0)';
  summary.C6.z = '"$"#,##0';
  summary.D6.f = `SUM('Ventas'!N6:N${salesRows.length + 5})`;
  summary.A8 = { v: 'Guía de uso', t: 's', s: { ...tableHeaderStyle, alignment: { horizontal: 'left', vertical: 'center' } } };
  summary.A9 = { v: 'El archivo contiene una hoja de ventas por pedido y una hoja de detalle por producto. Usa los filtros de las tablas para analizar fechas, horas, pagos o productos.', t: 's', s: { ...bodyStyle, alignment: { wrapText: true, vertical: 'center' } } };
  summary.A2.s = bodyStyle; summary.B2.s = bodyStyle; summary.A3.s = bodyStyle; summary.B3.s = bodyStyle;

  applyReportLayout(salesSheet, 'QuickBite | Ventas por pedido', salesHeaders, salesRows, [14, 15, 14, 25, 29, 16, 19, 17, 18, 18, 22, 16, 12, 12, 20], [11]);
  applyReportLayout(detailsSheet, 'QuickBite | Detalle de productos vendidos', detailHeaders, detailRows, [14, 15, 14, 30, 20, 16, 12, 16, 14, 25], [5, 7]);

  XLSX.utils.book_append_sheet(workbook, summary, 'Resumen');
  XLSX.utils.book_append_sheet(workbook, salesSheet, 'Ventas');
  XLSX.utils.book_append_sheet(workbook, detailsSheet, 'Detalle de productos');
  return workbook;
}

export async function downloadActiveSalesExcel(orders: Order[]): Promise<ExcelSalesExportResult> {
  const sales = reportOrders(orders);
  const fileName = `quickbite-reporte-ventas-${new Date().toISOString().slice(0, 10)}.xlsx`;
  const workbook = buildActiveSalesWorkbook(orders);
  const { data } = await requireSupabaseClient().from('loyalty_redemptions').select('redemption_code,created_at,points_spent,status,user:profiles!loyalty_redemptions_user_id_fkey(full_name),reward:loyalty_rewards(title)');
  const rows = (data ?? []).map((r: any) => [r.redemption_code ?? '', new Date(r.created_at).toLocaleString('es-CO'), Array.isArray(r.user) ? (r.user[0]?.full_name ?? '') : (r.user?.full_name ?? ''), Array.isArray(r.reward) ? (r.reward[0]?.title ?? '') : (r.reward?.title ?? ''), Number(r.points_spent ?? 0), r.status ?? '']);
  const canjes = XLSX.utils.aoa_to_sheet([['Código','Fecha','Estudiante','Recompensa','Puntos','Estado'], ...rows]);
  canjes['!cols'] = [{wch:18},{wch:22},{wch:28},{wch:28},{wch:12},{wch:16}];
  XLSX.utils.book_append_sheet(workbook, canjes, 'Canjes');
  XLSX.writeFile(workbook, fileName, { compression: true });
  return { count: sales.length, fileName };
}

/** Builds a UTF-8 CSV that Google Sheets can import without any external integration. */
export function buildActiveSalesCsv(orders: Order[]) {
  const sales = reportOrders(orders);
  if (!sales.length) throw new Error('No hay ventas para descargar.');

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
  const sales = reportOrders(orders);
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
