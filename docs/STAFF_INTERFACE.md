# QuickBite Staff

## Propósito

Staff es el espacio operativo de la cafetería para gestionar pedidos, catálogo, inventario y consulta de recargas. La interfaz es independiente de Administración y utiliza RPC con permisos específicos en la base de datos.

## Acceso y límites

- Solo una cuenta Staff activa puede entrar a `/staff`.
- Solo Administración puede crear, cambiar, activar o desactivar las cuentas Staff.
- Staff no crea usuarios ni administradores, no cambia roles, no desactiva cuentas y no entra a rutas administrativas.
- Staff no confirma pagos ni aprueba/rechaza recargas que modifiquen saldos.
- Un pedido ya pagado no puede ser rechazado por Staff; la devolución o cancelación financiera la tramita Administración.

## Operación de pedidos

- La cola refleja pedidos pendientes, en preparación y listos, con actualización periódica y Realtime.
- Staff puede aceptar un pedido solamente después de que su pago esté confirmado.
- Staff puede rechazar un pedido que aún tenga el pago pendiente. El rechazo requiere confirmación, permite registrar un motivo, devuelve unidades al inventario y crea trazabilidad.
- El ciclo operativo tras aceptar es `preparing -> ready -> delivered`. Los cambios se validan en el servidor, generan notificaciones al estudiante y se escriben en `audit_logs`.

## Menú, ingredientes y nutrición

- Staff puede crear o editar alimentos y categorías, precios, descripciones, imágenes y disponibilidad.
- Los productos nuevos comienzan ocultos y con stock cero. Los ajustes de stock se hacen desde Inventario.
- Los borradores se crean manualmente en ChatGPT y se copian/pegan en la ficha. El cliente no llama a un proveedor de IA ni necesita una clave de API.
- Los borradores quedan como `ai_draft`, con ingredientes y datos nutricionales no verificados. Para publicar, hace falta registrar ingredientes y alérgenos y marcar explícitamente que se revisaron contra la receta o etiqueta del proveedor.
- La familia puede consultar la ficha desde Parent y usar los controles ya existentes para bloquear alimentos o ingredientes. La ausencia de un alérgeno en la ficha no garantiza que el producto esté libre de él.

## Inventario

- Staff puede ajustar stock indicando un motivo obligatorio.
- La función bloquea el producto durante el ajuste y el disparador existente registra stock anterior, nuevo, usuario y motivo.
- El panel consulta los movimientos recientes; no concede permiso para modificar saldos o ejecutar herramientas administrativas.

## Recargas y presencia

- Staff puede consultar solicitudes de recarga, método, referencia, comentario, importe y estado. La aprobación/rechazo financiero sigue siendo exclusiva de Administración.
- Las sesiones autenticadas actualizan una marca temporal de actividad cada 30 segundos, solo cuando la pestaña está visible.
- Se considera conectado quien registró actividad en los últimos 90 segundos. La lista muestra nombre, rol y última actividad; no muestra correo, rutas recorridas ni datos de sesión.
- Es una señal aproximada de actividad reciente, no una garantía de que una persona esté mirando la pantalla.

## Historial

Las funciones operativas añaden eventos a `audit_logs`. Staff puede consultar las acciones asociadas a su propia cuenta; no recibe el registro completo de administración ni puede modificarlo.

## Validación requerida

1. CI: typecheck, lint, pruebas unitarias y compilación.
2. E2E: navegación por todos los módulos de Staff y ausencia de errores del navegador o respuestas fallidas.
3. Comprobaciones de permisos para rechazo de pedidos pagados, pagos no confirmados, edición de menú, publicación no verificada, ajustes de stock y consultas financieras.
4. Auditoría de seguridad/performance de base de datos y smoke test del despliegue antes de considerar la implementación productiva.
