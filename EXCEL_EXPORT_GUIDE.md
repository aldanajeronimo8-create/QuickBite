# Exportación de ventas a Excel

QuickBite utiliza **Excel (.xlsx)** como formato oficial para cerrar y descargar los reportes de ventas.

## Formato

Los archivos se generan directamente desde la aplicación con extensión `.xlsx` y pueden abrirse en Microsoft Excel, LibreOffice Calc y aplicaciones compatibles.

El reporte incluye:

- **Resumen:** total facturado, pedidos exportados, ticket promedio y unidades vendidas.
- **Ventas:** una fila por pedido, con cliente, estados, método de pago, total y código de recogida.
- **Detalle de productos:** productos, categoría, precio unitario, cantidad, subtotal y stock.

## Reglas de cierre

1. Solo administración puede cerrar/exportar el período.
2. Los pedidos activos se exportan a un archivo `.xlsx`.
3. El historial de pedidos permanece en Supabase.
4. Los pedidos cerrados se identifican con las marcas de exportación correspondientes.
5. Un nuevo período trabaja con los pedidos que aún no han sido cerrados.

## Importante

Google Sheets y Google Apps Script **no forman parte del flujo oficial de exportación de QuickBite**. Cualquier referencia heredada debe considerarse obsoleta y no debe volver a introducirse en la aplicación.
