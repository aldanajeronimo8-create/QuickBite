import type { Order, OrderItem } from '../lib/supabase';
import { listOrdersForExport } from '../repositories/quickbiteRepository';

const MAX_WEEKLY_EXPORT_ROWS = 10000;

export interface WeeklyOrderExportResult {
  count: number;
  fileName: string;
  weekStartIso: string;
}

function getWeekStart(now = new Date()) {
  const start = new Date(now);
  const dayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dayOffset);
  start.setHours(0, 0, 0, 0);
  return start;
}

function escapeXml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatFileDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join('');
}

function cell(value: unknown, type: 'String' | 'Number' | 'DateTime' = 'String', styleId?: string) {
  const style = styleId ? ` ss:StyleID="${styleId}"` : '';
  return `<Cell${style}><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`;
}

function itemCount(items: OrderItem[] = []) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

function itemSummary(items: OrderItem[] = []) {
  return items
    .map((item) => {
      const name = item.product?.name ?? item.product_id;
      return `${item.quantity} x ${name} (${asNumber(item.price)})`;
    })
    .join(' | ');
}

function buildOrdersWorkbookXml(orders: Order[], weekStart: Date) {
  const headers = [
    'Numero',
    'Fecha',
    'Cliente',
    'Correo',
    'Estado',
    'Pago',
    'Metodo',
    'Total',
    'Codigo recogida',
    'Minutos estimados',
    'Unidades',
    'Articulos',
    'Oculto admin',
  ];

  const rows = orders.map((order) => [
    cell(order.order_number),
    cell(new Date(order.created_at).toISOString(), 'DateTime', 'Date'),
    cell(order.user?.full_name ?? ''),
    cell(order.user?.email ?? ''),
    cell(order.status),
    cell(order.payment_status),
    cell(order.payment_method),
    cell(asNumber(order.total), 'Number', 'Currency'),
    cell(order.pickup_code ?? ''),
    cell(order.estimated_minutes ?? '', order.estimated_minutes == null ? 'String' : 'Number'),
    cell(itemCount(order.order_items), 'Number'),
    cell(itemSummary(order.order_items)),
    cell(order.admin_hidden ? 'Si' : 'No'),
  ]);

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Title>QuickBite pedidos semanales</Title>
    <Created>${escapeXml(new Date().toISOString())}</Created>
  </DocumentProperties>
  <Styles>
    <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1E3A8A" ss:Pattern="Solid"/></Style>
    <Style ss:ID="Date"><NumberFormat ss:Format="yyyy-mm-dd hh:mm"/></Style>
    <Style ss:ID="Currency"><NumberFormat ss:Format="$#,##0"/></Style>
  </Styles>
  <Worksheet ss:Name="Pedidos semana">
    <Table>
      <Row>${headers.map((header) => cell(header, 'String', 'Header')).join('')}</Row>
      ${rows.map((row) => `<Row>${row.join('')}</Row>`).join('\n      ')}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="Resumen">
    <Table>
      <Row>${cell('Semana desde', 'String', 'Header')}${cell(weekStart.toISOString(), 'DateTime', 'Date')}</Row>
      <Row>${cell('Pedidos exportados', 'String', 'Header')}${cell(orders.length, 'Number')}</Row>
      <Row>${cell('Limite', 'String', 'Header')}${cell(MAX_WEEKLY_EXPORT_ROWS, 'Number')}</Row>
    </Table>
  </Worksheet>
</Workbook>`;
}

function downloadWorkbook(xml: string, fileName: string) {
  const blob = new Blob([xml], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportWeeklyOrdersToExcel(): Promise<WeeklyOrderExportResult> {
  const weekStart = getWeekStart();
  const orders = await listOrdersForExport(weekStart.toISOString(), MAX_WEEKLY_EXPORT_ROWS);
  const fileName = `quickbite-pedidos-semana-${formatFileDate(new Date())}.xls`;
  const workbook = buildOrdersWorkbookXml(orders, weekStart);

  downloadWorkbook(workbook, fileName);

  return {
    count: orders.length,
    fileName,
    weekStartIso: weekStart.toISOString(),
  };
}
