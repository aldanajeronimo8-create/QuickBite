import type { Order, OrderItem, Product, Profile } from '../lib/supabase';
import {
  listAllOrdersForExport,
  listProducts,
  listProfiles,
  resetAllOrders,
} from '../repositories/quickbiteRepository';

export interface OrderExportResult {
  count: number;
  resetCount: number;
  fileName: string;
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

function buildOrdersWorkbookXml(orders: Order[], products: Product[], profiles: Profile[]) {
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

  const itemRows = orders.flatMap((order) =>
    (order.order_items ?? []).map((item) => [
      cell(order.order_number),
      cell(new Date(order.created_at).toISOString(), 'DateTime', 'Date'),
      cell(order.user?.full_name ?? ''),
      cell(item.product?.name ?? item.product_id),
      cell(item.quantity, 'Number'),
      cell(asNumber(item.price), 'Number', 'Currency'),
      cell(asNumber(item.price) * item.quantity, 'Number', 'Currency'),
    ]),
  );
  const customerOrders = new Map<string, Order[]>();
  orders.forEach((order) => {
    const existing = customerOrders.get(order.user_id) ?? [];
    existing.push(order);
    customerOrders.set(order.user_id, existing);
  });
  const customerRows = Array.from(customerOrders.entries()).map(([userId, customerOrders]) => {
    const profile = customerOrders[0]?.user ?? profiles.find((user) => user.id === userId);
    return [
      cell(profile?.full_name ?? 'Cliente sin perfil'),
      cell(profile?.email ?? ''),
      cell(profile?.ti ?? ''),
      cell(customerOrders.length, 'Number'),
      cell(customerOrders.reduce((sum, order) => sum + asNumber(order.total), 0), 'Number', 'Currency'),
      cell(
        customerOrders.reduce((sum, order) => sum + itemCount(order.order_items), 0),
        'Number',
      ),
    ];
  });
  const stockRows = products.map((product) => [
    cell(product.name),
    cell(product.category?.name ?? ''),
    cell(asNumber(product.price), 'Number', 'Currency'),
    cell(product.stock, 'Number'),
    cell(product.available ? 'Disponible' : 'Oculto'),
    cell(product.description ?? ''),
  ]);
  const totalSales = orders.reduce((sum, order) => sum + asNumber(order.total), 0);

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Title>Respaldo de operaciones QuickBite</Title>
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
  <Worksheet ss:Name="Detalle compras">
    <Table>
      <Row>${['Numero pedido', 'Fecha', 'Cliente', 'Producto', 'Cantidad', 'Precio unidad', 'Subtotal'].map((header) => cell(header, 'String', 'Header')).join('')}</Row>
      ${itemRows.map((row) => `<Row>${row.join('')}</Row>`).join('\n      ')}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="Compradores">
    <Table>
      <Row>${['Nombre', 'Correo', 'Documento', 'Pedidos', 'Total comprado', 'Unidades compradas'].map((header) => cell(header, 'String', 'Header')).join('')}</Row>
      ${customerRows.map((row) => `<Row>${row.join('')}</Row>`).join('\n      ')}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="Inventario">
    <Table>
      <Row>${['Producto', 'Categoria', 'Precio', 'Stock actual', 'Disponibilidad', 'Descripcion'].map((header) => cell(header, 'String', 'Header')).join('')}</Row>
      ${stockRows.map((row) => `<Row>${row.join('')}</Row>`).join('\n      ')}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="Resumen">
    <Table>
      <Row>${cell('Pedidos exportados', 'String', 'Header')}${cell(orders.length, 'Number')}</Row>
      <Row>${cell('Compradores unicos', 'String', 'Header')}${cell(customerRows.length, 'Number')}</Row>
      <Row>${cell('Total vendido', 'String', 'Header')}${cell(totalSales, 'Number', 'Currency')}</Row>
      <Row>${cell('Productos en inventario', 'String', 'Header')}${cell(products.length, 'Number')}</Row>
      <Row>${cell('Generado el', 'String', 'Header')}${cell(new Date().toISOString(), 'DateTime', 'Date')}</Row>
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

export async function exportOrdersToExcel(): Promise<OrderExportResult> {
  const [orders, products, profiles] = await Promise.all([
    listAllOrdersForExport(),
    listProducts(),
    listProfiles(),
  ]);
  const fileName = `quickbite-respaldo-${formatFileDate(new Date())}.xls`;
  const workbook = buildOrdersWorkbookXml(orders, products, profiles);

  downloadWorkbook(workbook, fileName);
  const resetCount = await resetAllOrders();

  return {
    count: orders.length,
    resetCount,
    fileName,
  };
}

// Kept for callers from older versions of the admin screen.
export const exportWeeklyOrdersToExcel = exportOrdersToExcel;
