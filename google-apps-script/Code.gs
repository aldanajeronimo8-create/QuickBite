/**
 * QuickBite Google Apps Script Web App receiver.
 * Script properties required: SPREADSHEET_ID and GOOGLE_SHEETS_SHARED_SECRET.
 * Deploy as a Web App that executes as the spreadsheet owner.
 */
function doPost(e) {
  try {
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('GOOGLE_SHEETS_SHARED_SECRET');
    const receivedSecret = e && e.parameter ? e.parameter.secret : null;
    // Apps Script does not reliably expose custom request headers, so the Edge Function also sends the secret in JSON.
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!expectedSecret || body.secret !== expectedSecret && receivedSecret !== expectedSecret) return json_({ ok: false, error: 'unauthorized' });
    if (!body.batchId || !Array.isArray(body.orders)) return json_({ ok: false, error: 'invalid_payload' });

    const lock = LockService.getScriptLock(); lock.waitLock(30000);
    try {
      const properties = PropertiesService.getScriptProperties();
      if (properties.getProperty('quickbite_batch_' + body.batchId)) return json_({ ok: true, batchId: body.batchId, duplicate: true });
      const spreadsheetId = properties.getProperty('SPREADSHEET_ID');
      if (!spreadsheetId) return json_({ ok: false, error: 'spreadsheet_not_configured' });
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const sales = sheet_(spreadsheet, 'Ventas', ['ID pedido', 'Número', 'Fecha', 'Hora', 'Cliente', 'Correo', 'Documento', 'Estado pedido', 'Estado pago', 'Método pago', 'Total', 'Código recogida', 'Minutos estimados', 'Referencia pago', 'Lote']);
      const details = sheet_(spreadsheet, 'Detalle de ventas', ['ID pedido', 'Número', 'Producto', 'Categoría', 'Cantidad', 'Precio unitario', 'Subtotal', 'Stock restante', 'Lote']);
      const buyers = sheet_(spreadsheet, 'Compradores', ['ID pedido', 'Cliente', 'Correo', 'Documento', 'Fecha', 'Lote']);
      const inventory = sheet_(spreadsheet, 'Inventario', ['ID pedido', 'Producto', 'Categoría', 'Cantidad vendida', 'Stock restante', 'Fecha', 'Lote']);
      const summary = sheet_(spreadsheet, 'Resumen', ['Lote', 'Cerrado en', 'Cerrado por', 'Ventas', 'Total']);
      const salesRows = [], detailRows = [], buyerRows = [], inventoryRows = [];
      let total = 0;
      body.orders.forEach(function(order) {
        const date = new Date(order.createdAt); total += Number(order.total) || 0;
        salesRows.push([order.id, order.orderNumber, date, Utilities.formatDate(date, Session.getScriptTimeZone(), 'HH:mm'), order.customer && order.customer.name || '', order.customer && order.customer.email || '', order.customer && order.customer.identification || '', order.status || '', order.paymentStatus || '', order.paymentMethod || '', order.total || 0, order.pickupCode || '', order.estimatedMinutes || '', order.paymentReference || '', body.batchId]);
        buyerRows.push([order.id, order.customer && order.customer.name || '', order.customer && order.customer.email || '', order.customer && order.customer.identification || '', date, body.batchId]);
        (order.items || []).forEach(function(item) { detailRows.push([order.id, order.orderNumber, item.product || '', item.category || '', item.quantity || 0, item.unitPrice || 0, item.subtotal || 0, item.remainingStock == null ? '' : item.remainingStock, body.batchId]); inventoryRows.push([order.id, item.product || '', item.category || '', item.quantity || 0, item.remainingStock == null ? '' : item.remainingStock, date, body.batchId]); });
      });
      append_(sales, salesRows); append_(details, detailRows); append_(buyers, buyerRows); append_(inventory, inventoryRows); append_(summary, [[body.batchId, new Date(body.closedAt), body.closedBy || '', body.orders.length, total]]);
      properties.setProperty('quickbite_batch_' + body.batchId, new Date().toISOString());
      return json_({ ok: true, batchId: body.batchId });
    } finally { lock.releaseLock(); }
  } catch (error) { console.error(error); return json_({ ok: false, error: 'server_error' }); }
}
function sheet_(book, name, headers) { const sheet = book.getSheetByName(name) || book.insertSheet(name); if (sheet.getLastRow() === 0) sheet.appendRow(headers); return sheet; }
function append_(sheet, rows) { if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows); }
function json_(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }