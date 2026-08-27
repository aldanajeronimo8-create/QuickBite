/*
 * Deploy this file as a Google Apps Script Web App. Keep EXPORT_SHARED_SECRET
 * in the Script Properties, never in this file or the browser.
 */
const SHEETS = {
  sales: 'Ventas',
  inventory: 'Inventario',
  summary: 'Resumen',
  history: 'Historial de Exportaciones',
};

function doPost(event) {
  try {
    const secret = PropertiesService.getScriptProperties().getProperty('EXPORT_SHARED_SECRET');
    if (!secret || event.parameter.secret !== secret) return json({ error: 'unauthorized' }, 401);
    const payload = JSON.parse(event.postData.contents);
    if (!payload.exportId || !Array.isArray(payload.sales)) return json({ error: 'invalid_payload' }, 400);

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const history = sheet(spreadsheet, SHEETS.history, historyHeaders());
    const prior = history.getDataRange().getValues().some((row, index) => index > 0 && row[0] === payload.exportId);
    if (prior) return json({ exportId: payload.exportId, receivedSalesCount: payload.sales.length, idempotent: true });

    append(sheet(spreadsheet, SHEETS.sales, salesHeaders()), payload.sales);
    append(sheet(spreadsheet, SHEETS.inventory, inventoryHeaders()), payload.inventory);
    append(sheet(spreadsheet, SHEETS.summary, summaryHeaders()), payload.summary);
    append(history, [[payload.exportId, payload.exportDate, payload.exportTime, payload.adminName,
      payload.sales.length, payload.totalExported, 'completed', payload.exportedAt, payload.periodId]]);
    SpreadsheetApp.flush();
    return json({ exportId: payload.exportId, receivedSalesCount: payload.sales.length });
  } catch (error) {
    return json({ error: String(error && error.message ? error.message : error) }, 500);
  }
}

function sheet(book, name, headers) {
  const result = book.getSheetByName(name) || book.insertSheet(name);
  if (result.getLastRow() === 0) result.appendRow(headers);
  return result;
}
function append(target, rows) { if (rows.length) target.getRange(target.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows); }
function json(value, status) { return ContentService.createTextOutput(JSON.stringify({ ...value, status })).setMimeType(ContentService.MimeType.JSON); }
function salesHeaders() { return ['ID pedido','Fecha','Hora','Fecha y hora','ID estudiante','Estudiante','Documento','Producto','Categoría','Cantidad','Precio unitario','Subtotal','Descuento','Total pedido','Método pago','Estado pago','Estado pedido','Administrador','Código pedido','Observaciones','Stock antes','Stock restante']; }
function inventoryHeaders() { return ['ID producto','Producto','Categoría','Precio','Stock inicial del periodo','Unidades vendidas','Stock restante','Actualizado','Estado','Disponibilidad']; }
function summaryHeaders() { return ['ID exportación','Fecha','Hora','Indicador','Valor']; }
function historyHeaders() { return ['ID exportación','Fecha','Hora','Administrador','Ventas exportadas','Total exportado','Estado','Fecha/hora cierre','Periodo']; }
