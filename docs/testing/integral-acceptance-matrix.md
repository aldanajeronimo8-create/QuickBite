# QuickBite — matriz de aceptación integral

La aceptación verifica comportamientos definidos y evidencias concretas; no equivale a una garantía absoluta de ausencia de defectos. La prueba stateful principal vive en `tests/e2e/critical-flows.spec.ts`, se ejecuta contra la aplicación y hace solo lecturas de evidencia con la clave de servicio.

| Área | Rol/actor | Estado inicial | Acción real | Resultado visible | Persistencia / conciliación | Evidencia |
|---|---|---|---|---|---|---|
| Compra | Estudiante | Producto disponible y con stock positivo | Añadir producto, elegir Nequi y enviar pago para aprobación | Recibo con número de pedido; artículo visible en carrito | Pedido pertenece al perfil E2E, inicia pendiente, contiene producto/cantidad, total igual a suma de líneas | Playwright + consulta de solo lectura a `orders`, `order_items`, `profiles` |
| Pago | Administrador | El pedido de la compra existe con pago pendiente | Confirmar en `/admin/payments` | La tarjeta muestra `Confirmado` | `payment_status=confirmed` y el pedido todavía está en estado pendiente hasta comenzar preparación | Aserción UI + consulta de solo lectura a `orders`; diagnóstico conservado al fallar |
| Preparación | Personal de cafetería | Pago confirmado, pedido pendiente | Accionar “Comenzar preparación” | La tarjeta pasa a “En preparación” | `orders.status=preparing` | Playwright + lectura DB |
| Listo para recoger | Personal de cafetería | Pedido en preparación | Accionar “Marcar como listo” | La tarjeta muestra “Listo” | `orders.status=ready` | Playwright + lectura DB |
| Entrega | Personal de cafetería | Pedido listo | Accionar “Marcar como entregado” | El pedido sale de la cola activa | `orders.status=delivered`; permanece visible en historial del estudiante | Playwright + lectura DB + historial |
| Inventario | Compra del estudiante | Stock inicial medido antes de comprar | Completar la compra real de una unidad | El flujo de compra termina correctamente | Stock posterior equivale al stock inicial menos la cantidad; existe un movimiento con cantidad y valores anterior/nuevo coherentes; entregar el pedido no vuelve a descontar stock | Consultas de solo lectura a `products` y `inventory_movements` |
| Exportación | Administrador | El pedido ya está entregado y pagado | Elegir la fecha de compra, seleccionar “Diario” y descargar Excel desde `/admin/reports` | Se descarga un archivo `.xlsx` | La hoja `Ventas` contiene el número de pedido, estado `Entregado`, pago `Confirmado` y total igual al registro de origen | Lectura del libro descargado con la biblioteca XLSX y comparación contra pedido de origen |
| Navegación | Estudiante | Sesión autenticada | Abrir las superficies críticas del rol | Las rutas configuradas cargan y no presentan errores de ejecución | Errores de página y de API relevantes hacen fallar la prueba | `production-acceptance.spec.ts`, `role-interfaces.spec.ts`, K6 |
| Navegación | Acudiente | Sesión autenticada | Abrir el contexto familiar y las rutas de rol | Interfaz familiar accesible | El acceso a rutas administrativas se deniega | Aserciones de rutas y permisos E2E |
| Navegación y operación | Personal de cafetería | Sesión de personal activa | Abrir la cola y procesar el pedido real | Controles de preparación, listo y entrega disponibles en secuencia | RPC de personal deja estados persistidos; rutas administrativas denegadas | Flujo stateful en `critical-flows.spec.ts` y matriz de roles |
| Navegación y administración | Administrador | Sesión administrativa activa | Abrir pagos, pedidos, inventario e informes | Rutas y controles administrativos disponibles | Moderación autorizada y estados de pedido persistidos; los roles no administrativos no acceden a las superficies protegidas | Aserciones E2E + K6 para cuatro roles |

## Reglas de interpretación

- El éxito HTTP por sí solo no prueba que un enlace sea correcto. K6 exige una respuesta exitosa, el destino final esperado y contenido renderizado; un 4xx o una ruta de destino distinta debe fallar.
- La clave de servicio se usa únicamente para leer la evidencia de la operación que las personas hicieron por UI. El test no modifica datos usando privilegios elevados.
- El contrato de exportación Excel existente y `scripts/integrity-audit.mjs` se mantienen intactos.
- La cadena debe verificarse para el mismo SHA: CI → Auditoría Exhaustiva → Auditoría de Integridad → Aceptación Integral. Un job pendiente, omitido o bloqueado no equivale a aprobado.
- La prueba de exportación valida el informe Excel que la interfaz realmente ofrece. No declara completada una integración externa que el entorno de prueba no haya ejecutado.
