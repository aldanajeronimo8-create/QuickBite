import * as XLSX from '@redoper1/xlsx-js-style';
import type { Order } from '../lib/supabase';
import { dateKeyInBogota, formatPeriodDateRange, getMonthWeekGroups, type ReportPeriod } from '../lib/reportPeriods';

const dateFormatter = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFormatter = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const weekdayFormatter = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long' });
const currencyFormat = '"$"#,##0';
const numberFormat = '0';
const titleStyle = { fill: { fgColor: { rgb: '1E3A8A' } }, font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'left', vertical: 'center' } };
const headerStyle = { fill: { fgColor: { rgb: '14532D' } }, font: { bold: true, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
const labelStyle = { fill: { fgColor: { rgb: 'DBEAFE' } }, font: { bold: true, color: { rgb: '1E3A8A' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
const valueStyle = { fill: { fgColor: { rgb: 'EFF6FF' } }, font: { bold: true, color: { rgb: '0F172A' } }, alignment: { horizontal: 'center', vertical: 'center' } };
const alternateRowStyle = { fill: { fgColor: { rgb: 'F5F9FF' } } };

function sheetCell(row: number, column: number) { return XLSX.utils.encode_cell({ r: row, c: column }); }
function purchaseDate(value: string) { return dateFormatter.format(new Date(value)); }
function purchaseTime(value: string) { return timeFormatter.format(new Date(value)); }
function statusLabel(value: string) { return ({ pending: 'Pendiente', preparing: 'En preparación', ready: 'Listo para recoger', delivered: 'Entregado', cancelled: 'Cancelado', confirmed: 'Confirmado', rejected: 'Rechazado' } as Record<string, string>)[value] ?? value; }
function paymentLabel(value: string) { return ({ nequi: 'Nequi', 'bre-b': 'Bre-B', cash: 'Efectivo' } as Record<string, string>)[value] ?? value; }
function confirmed(orders: Order[]) { return orders.filter((order) => order.payment_status === 'confirmed'); }
function calculateTotalSales(orders: Order[]) { return confirmed(orders).reduce((sum, order) => sum + Number(order.total), 0); }
function totalUnits(orders: Order[]) { return confirmed(orders).reduce((sum, order) => sum + Number(order.order_items?.reduce((units, item) => units + Number(item.quantity), 0) ?? 0), 0); }
function orderItems(orders: Order[]) { return orders.flatMap((order) => order.order_items ?? []); }
function detailRows(orders: Order[]) { return orders.flatMap((order) => (order.order_items ?? []).map((item) => [order.order_number, purchaseDate(order.created_at), purchaseTime(order.created_at), item.product?.name ?? 'Producto no disponible', item.product?.category?.name ?? 'Sin categoría', Number(item.price), Number(item.quantity), Number(item.price) * Number(item.quantity), Number(item.product?.stock ?? 0), order.user?.full_name ?? 'Sin cliente'])); }
function salesRows(orders: Order[]) { return orders.map((order) => [order.order_number, purchaseDate(order.created_at), purchaseTime(order.created_at), order.user?.full_name ?? 'Sin cliente', order.user?.email ?? '', order.user?.ti ?? '', statusLabel(order.status), statusLabel(order.payment_status), paymentLabel(order.payment_method), order.pickup_code ?? '', order.payment_reference ?? '', Number(order.total), Number(order.order_items?.length ?? 0), Number(order.order_items?.reduce((sum, item) => sum + Number(item.quantity), 0) ?? 0), Number(order.estimated_minutes ?? 0)]); }
function writeTable(sheet: XLSX.WorkSheet, startRow: number, headers: string[], rows: unknown[][], widths: number[], currencyColumns: number[] = [], integerColumns: number[] = []) {
  headers.forEach((header, column) => { sheet[sheetCell(startRow, column)] = { v: header, t: 's', s: headerStyle }; });
  rows.forEach((row, rowIndex) => row.forEach((value, column) => {
    const cell = sheetCell(startRow + 1 + rowIndex, column);
    sheet[cell] = { v: value as never, t: typeof value === 'number' ? 'n' : 's', s: rowIndex % 2 ? alternateRowStyle : undefined };
    sheet[cell].z = currencyColumns.includes(column) ? currencyFormat : integerColumns.includes(column) ? numberFormat : 'General';
  }));
  const endRow = Math.max(startRow + rows.length, startRow + 1);
  sheet['!cols'] = widths.map((wch) => ({ wch }));
  sheet['!autofilter'] = { ref: `A${startRow + 1}:${sheetCell(endRow, headers.length - 1)}` };
  sheet['!freeze'] = { xSplit: 0, ySplit: startRow + 1, state: 'frozen' };
}
function metricRows(period: ReportPeriod, orders: Order[]) {
  const confirmedOrders = confirmed(orders);
  const sales = calculateTotalSales(orders);
  return [
    ['Período', period.label],
    ['Fecha inicial', dateFormatter.format(period.start)],
    ['Fecha final', dateFormatter.format(period.end)],
    ['Días totales', period.totalDays],
    ['Días con actividad', new Set(orders.map((order) => dateKeyInBogota(order.created_at))).size],
    ['Días sin actividad', Math.max(period.totalDays - new Set(orders.map((order) => dateKeyInBogota(order.created_at))).size, 0)],
    ['Ventas confirmadas', sales],
    ['Pedidos totales', orders.length],
    ['Pedidos confirmados', confirmedOrders.length],
    ['Pedidos rechazados', orders.filter((order) => order.payment_status === 'rejected').length],
    ['Unidades vendidas', totalUnits(orders)],
    ['Ticket promedio', confirmedOrders.length ? sales / confirmedOrders.length : 0],
    ['Líneas de producto vendidas', orderItems(confirmedOrders).length],
  ];
}

export function buildPeriodReportWorkbook(orders: Order[], period: ReportPeriod) {
  const confirmedSalesTotal = calculateTotalSales(orders);
  const days = period.days.map((day) => {
    const key = dateKeyInBogota(day.toISOString());
    const dayOrders = orders.filter((order) => dateKeyInBogota(order.created_at) === key);
    const confirmedDay = confirmed(dayOrders);
    return {
      day,
      key,
      label: weekdayFormatter.format(day),
      date: dateFormatter.format(day),
      active: dayOrders.length > 0,
      orders: dayOrders.length,
      sales: confirmedDay.reduce((sum, order) => sum + Number(order.total), 0),
      units: confirmedDay.reduce((sum, order) => sum + Number(order.order_items?.reduce((u, item) => u + Number(item.quantity), 0) ?? 0), 0),
    };
  });
  const workbook = XLSX.utils.book_new();
  const summaryRows = metricRows(period, orders);
  const summary = XLSX.utils.aoa_to_sheet([['QuickBite | Informe'], ...summaryRows]);
  summary['A1'] = { v: `QuickBite | ${period.title}`, t: 's', s: titleStyle };
  summary['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
  summary['!cols'] = [{ wch: 28 }, { wch: 45 }, { wch: 20 }, { wch: 20 }];
  summary['!rows'] = [{ hpt: 30 }];
  for (let i = 1; i < summaryRows.length + 1; i += 1) { summary[`A${i + 1}`].s = labelStyle; summary[`B${i + 1}`].s = valueStyle; }
  summary['B8'].z = currencyFormat;
  summary['B13'].z = currencyFormat;
  summary['B9'].z = summary['B10'].z = summary['B11'].z = summary['B12'].z = summary['B14'].z = numberFormat;
  XLSX.utils.book_append_sheet(workbook, summary, 'Resumen');

  const salesSheet = XLSX.utils.aoa_to_sheet([]);
  writeTable(
    salesSheet,
    0,
    ['N.º pedido', 'Fecha de compra', 'Hora de compra', 'Cliente', 'Correo', 'Documento', 'Estado pedido', 'Estado pago', 'Método de pago', 'Código recogida', 'Referencia de pago', 'Total pedido', 'Productos', 'Unidades', 'Tiempo estimado (min)'],
    salesRows(orders),
    [18, 13, 10, 24, 30, 18, 20, 18, 18, 18, 24, 16, 11, 11, 18],
    [11],
    [12, 13, 14],
  );
  XLSX.utils.book_append_sheet(workbook, salesSheet, 'Ventas');

  if (period.mode === 'daily') {
    const daySheet = XLSX.utils.aoa_to_sheet([]);
    writeTable(daySheet, 0, ['Día', 'Fecha', 'Actividad', 'Ventas', 'Pedidos', 'Unidades'], days.map((d) => [d.label, d.date, d.active ? 'Sí' : 'No', d.sales, d.orders, d.units]), [18, 14, 14, 18, 14, 14], [3], [4, 5]);
    daySheet['A1'].s = headerStyle;
    XLSX.utils.book_append_sheet(workbook, daySheet, 'Estructura diaria');
  }

  if (period.mode === 'weekly') {
    const weekSheet = XLSX.utils.aoa_to_sheet([['Estructura de la semana'], ['Días totales', 7], ['Días con actividad', days.filter((day) => day.active).length], ['Días sin actividad', days.filter((day) => !day.active).length], ['Ventas confirmadas', confirmedSalesTotal], ['Pedidos', orders.length], ['Unidades', totalUnits(orders)]]);
    weekSheet['A1'] = { v: `Estructura · Semana ${period.weekNumber} de ${period.start.getUTCFullYear()}`, t: 's', s: titleStyle };
    weekSheet['B5'].z = currencyFormat;
    weekSheet['B6'].z = weekSheet['B7'].z = numberFormat;
    writeTable(weekSheet, 8, ['Día', 'Fecha', 'Actividad', 'Ventas', 'Pedidos', 'Unidades'], days.map((d) => [d.label, d.date, d.active ? 'Sí' : 'No', d.sales, d.orders, d.units]), [18, 14, 14, 18, 14, 14], [3], [4, 5]);
    XLSX.utils.book_append_sheet(workbook, weekSheet, 'Estructura semanal');
  }

  if (period.mode === 'monthly') {
    const monthlySheet = XLSX.utils.aoa_to_sheet([['Estructura del mes'], ['Período', formatPeriodDateRange(period)], ['Días totales', period.totalDays], ['Días con actividad', days.filter((day) => day.active).length], ['Días sin actividad', days.filter((day) => !day.active).length], ['Ventas confirmadas', confirmedSalesTotal], ['Pedidos', orders.length], ['Unidades', totalUnits(orders)]]);
    monthlySheet['A1'] = { v: `Estructura · ${period.label}`, t: 's', s: titleStyle };
    monthlySheet['B6'].z = currencyFormat;
    monthlySheet['B7'].z = monthlySheet['B8'].z = numberFormat;
    const groups = getMonthWeekGroups(period);
    let cursor = 9;
    for (const group of groups) {
      monthlySheet[sheetCell(cursor, 0)] = { v: `Semana ${group.weekNumber}`, t: 's', s: headerStyle };
      monthlySheet[sheetCell(cursor, 1)] = { v: `${dateFormatter.format(group.start)} — ${dateFormatter.format(group.end)}`, t: 's', s: headerStyle };
      cursor += 1;
      for (const groupDay of days.filter((d) => group.days.some((g) => g.getTime() === d.day.getTime()))) {
        monthlySheet[sheetCell(cursor, 0)] = { v: groupDay.label, t: 's' };
        monthlySheet[sheetCell(cursor, 1)] = { v: groupDay.date, t: 's' };
        monthlySheet[sheetCell(cursor, 2)] = { v: groupDay.active ? 'Sí' : 'No', t: 's' };
        monthlySheet[sheetCell(cursor, 3)] = { v: groupDay.sales, t: 'n', z: currencyFormat };
        monthlySheet[sheetCell(cursor, 4)] = { v: groupDay.orders, t: 'n', z: numberFormat };
        monthlySheet[sheetCell(cursor, 5)] = { v: groupDay.units, t: 'n', z: numberFormat };
        cursor += 1;
      }
      cursor += 1;
    }
    monthlySheet['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(workbook, monthlySheet, 'Estructura mensual');
    const weeklyRows = groups.map((group) => {
      const groupDays = days.filter((d) => group.days.some((g) => g.getTime() === d.day.getTime()));
      return [group.weekNumber, dateFormatter.format(group.start), dateFormatter.format(group.end), groupDays.filter((d) => d.active).length, groupDays.reduce((sum, d) => sum + d.sales, 0), groupDays.reduce((sum, d) => sum + d.orders, 0), groupDays.reduce((sum, d) => sum + d.units, 0)];
    });
    const weeksSheet = XLSX.utils.aoa_to_sheet([['Semana', 'Fecha inicial', 'Fecha final', 'Días con actividad', 'Ventas', 'Pedidos', 'Unidades'], ...weeklyRows]);
    for (let c = 0; c < 7; c += 1) weeksSheet[sheetCell(0, c)] = { v: weeksSheet[sheetCell(0, c)].v, t: 's', s: headerStyle };
    weeklyRows.forEach((_, r) => {
      weeksSheet[sheetCell(r + 1, 4)].z = currencyFormat;
      weeksSheet[sheetCell(r + 1, 0)].z = weeksSheet[sheetCell(r + 1, 3)].z = weeksSheet[sheetCell(r + 1, 5)].z = weeksSheet[sheetCell(r + 1, 6)].z = numberFormat;
    });
    weeksSheet['!cols'] = [10, 16, 16, 18, 18, 14, 14].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, weeksSheet, 'Resumen por semanas');
  }

  const detailsSheet = XLSX.utils.aoa_to_sheet([]);
  writeTable(detailsSheet, 0, ['N.º pedido', 'Fecha de compra', 'Hora de compra', 'Producto', 'Categoría', 'Precio unitario', 'Cantidad', 'Subtotal', 'Stock actual', 'Cliente'], detailRows(orders), [18, 13, 10, 30, 22, 16, 12, 16, 14, 24], [5, 7], [6, 8]);
  XLSX.utils.book_append_sheet(workbook, detailsSheet, 'Detalle de productos');
  return workbook;
}
