# QuickBite — plan de reconstrucción de Supabase

Fecha de inventario: 2026-10-10  
Repositorio fuente: `aldanajeronimo8-create/QuickBite`  
Rama de trabajo: `migration/new-supabase-baseline`  
Proyecto origen (solo lectura durante el inventario): `cczbbqxunygcowqfrqdm`

## Objetivo y límites

Reconstruir una nueva base que reproduzca el comportamiento real de QuickBite, con seguridad e integridad verificables, y trasladar únicamente los datos justificados por dependencias y necesidad funcional. No borrar ni alterar el proyecto de origen durante la preparación. No copiar secretos a este documento. No afirmar que una migración está completa hasta comparar datos y probar la aplicación.

## Fotografía verificada del origen

Consultas de solo lectura al proyecto de origen:
- 52 tablas públicas; 425 columnas.
- 65 claves foráneas; 361 restricciones CHECK; 152 índices.
- 101 políticas RLS; 160 funciones en `public`; 6 vistas; 50 triggers.
- 20 usuarios en `auth.users`; 20 identidades; 20 perfiles enlazados a Auth.
- 233 perfiles en total: 213 perfiles no enlazados a `auth.users`. Roles actuales: admin 90, parent 97, staff 38, both 6, student 2.
- `protected_admins`: 6 filas; las 6 coinciden con usuarios Auth.
- 45 pedidos, 45 líneas de pedido; 43 entregados, 1 pendiente y 1 listo. Los 45 pedidos tienen usuario Auth y líneas asociadas. 44 pagos confirmados y 1 pendiente.
- 5 cuentas de billetera; ninguna huérfana respecto a Auth. 0 filas actuales en `wallet_transactions` y `wallet_topup_requests`.
- `admin_notifications`: 412,750 filas aproximadamente; se ha observado previamente que 362,926 son huérfanas. No copiar en bloque. Recalcular al momento de la extracción y conservar solo notificaciones justificadas.
- `system_audit_logs`: 8,107 filas; `audit_logs`: 583; `system_health_checks`: 3,122; `api_rate_limits`: 3,043.
- Un bucket de Storage `quickbite-branding`, límite configurado 2 MiB, sin objetos en el recuento actual.
- La base origen aparece activa y en región `us-east-2`. No asumir que la región será la mejor para el nuevo proyecto sin revisar latencia, disponibilidad y coste.

Estos recuentos son una instantánea; repetirlos antes de extraer y después de importar.

## Inventario funcional de tablas públicas

### Núcleo que debe reconstruirse y migrarse con integridad
- Identidad/perfiles: `profiles`, `protected_admins`, `staff_roles`, `user_theme_preferences`, `student_data_consents`.
- Catálogo: `products`, `categories`, `product_nutrition`, `product_allergens`, `product_stock_settings`, `student_dietary_profiles`, `student_ingredient_blocks`, `favorites`, `product_reviews`.
- Pedidos/operación: `orders`, `order_items`, `order_cancellation_requests`, `pickup_slots`, `order_window_settings`, `weekly_menu_items`, `recess_schedules`, `recess_schedule_targets`, `academic_sections`, `academic_grades`, `academic_courses`.
- Pagos/saldos/inventario: `wallet_accounts`, `wallet_transactions`, `wallet_topup_requests`, `inventory_movements`, `demand_observations`, `daily_summaries`.
- Familia/seguridad alimentaria: `parent_student_links`, `parent_active_student_context`, `family_link_codes`, `parent_food_blocks`, `student_spending_limits`.
- Notificaciones/experiencia: `notifications`, `admin_notifications`, `system_alerts`.
- Fidelidad: `loyalty_redemptions`, `loyalty_rewards`, `loyalty_settings`, `loyalty_point_ledger`.
- Administración/reportes: `report_periods`, `automation_jobs`, `automation_settings`, `system_audit_logs`, `audit_logs`, `system_health_checks`, `app_secrets`, `api_rate_limits`, `user_presence`.

La inclusión en el esquema no significa que se deban copiar todas las filas. Las tablas vacías también pueden ser necesarias para que la app funcione y por eso no se deben eliminar solo por estar vacías.

## Datos a conservar en la primera migración

1. Los 20 usuarios Auth actuales y sus identidades, verificando método de inicio de sesión y requisitos de migración de credenciales. No copiar sesiones, refresh tokens ni desafíos temporales como datos de negocio.
2. Los 20 perfiles vinculados a Auth, sus roles legítimos, relaciones académicas y preferencias necesarias.
3. Los 6 registros de cuentas protegidas, sin escribir correos ni credenciales en documentación.
4. Los 45 pedidos, sus 45 líneas y todas las referencias relacionadas; comprobar también estados, importes, métodos de pago, fechas y códigos de recogida.
5. Catálogo y configuración operativa actual, junto con movimientos de inventario y cualquier historial financiero con datos reales.
6. Consentimientos y registros de auditoría que sean necesarios para trazabilidad, cumplimiento o reclamaciones, después de revisar la finalidad y retención.
7. Solo notificaciones útiles para usuarios válidos y datos que la aplicación aún necesite. No copiar fan-out huérfano ni límites de API caducados.

## Perfiles sin Auth

Hay 213 perfiles sin correspondencia con `auth.users`. No importarlos automáticamente como cuentas activas. Antes, buscar dependencias en todos los datos y el código, identificar si son históricos, pruebas o cuentas incompletas, y documentar la decisión por grupo. No eliminar el origen durante la migración.

## Reconstrucción técnica requerida

- Reconciliar primero la deriva de migraciones: la base registra 207 migraciones, mientras que el repositorio tiene 158 archivos SQL. Hay nombres que existen solo en cada lado; el recuento por nombre no equivale a una comparación semántica completa.
- Comparar cada migración remota no representada con el esquema real y el código del repositorio; crear una línea base reproducible y revisada. No aplicar a ciegas todas las migraciones antiguas ni editar el historial de producción para forzar coincidencias.
- Reconstruir extensiones realmente usadas, enums, funciones, vistas, triggers, índices, constraints, grants, RLS y permisos de ejecución. No instalar extensiones solo porque aparezcan disponibles.
- Revisar funciones `SECURITY DEFINER`, search_path y privilegios; mínimo privilegio por rol. Activar RLS en tablas expuestas y probar rutas anon/authenticated/admin/staff/parent/student.
- Reproducir Auth (proveedores, redirects, URLs, políticas de contraseña y confirmación) y Storage (bucket, políticas y objetos verificados). Configurar secretos fuera del repositorio.
- Separar pruebas E2E del entorno de producción: usar usuarios y datos sintéticos en una base/entorno aislado; bloquear ejecución de E2E si apunta a producción.
- Optimizar solo con evidencia: índices respaldados por consultas, evitar duplicados, retención explícita para telemetría, consultas por lotes, fan-out correcto de notificaciones y medición de planes/latencia. No denormalizar ni borrar tablas a ciegas.

## Validaciones de aceptación

- Comparación de esquema: tablas, columnas, tipos, defaults, constraints, FKs, índices, vistas, funciones, triggers, policies y grants.
- Reconciliación de datos por tabla: conteos, IDs, claves foráneas y hashes deterministas de conjuntos exportados.
- Pedidos y líneas: 45/45 como referencia de la fotografía, sin asumir que no habrá cambios antes del corte.
- Cuentas protegidas: 6/6 y acceso probado sin divulgar credenciales.
- Auth: todos los usuarios migrados o plan documentado para reautenticación; ningún secreto en cliente/repo.
- Seguridad: pruebas RLS por rol y revisión de funciones privilegiadas.
- Funcionalidad: login, cambio de espacio/rol, compra, pagos, stock, preparación/entrega, administración, padres/familia, menús y horarios, exportación/reportes y preferencias.
- Rendimiento: tiempos base antes/después, planes de consultas críticas y carga de notificaciones controlada.
- Rollback: mantener el origen intacto hasta completar pruebas y una ventana de aceptación. Cambiar variables de entorno solo después de aprobar los controles.

## Bloqueos actuales

- No se ha creado todavía el nuevo proyecto Supabase: primero debe consultarse el coste y recibir confirmación explícita del usuario.
- No se ha extraído ni copiado información personal.
- No se ha borrado ni modificado ningún dato de negocio del origen.
- El PR #62 y la limpieza de notificaciones no forman parte de una autorización para borrar datos.
- La nueva base no debe conectarse a la app hasta resolver la deriva de migraciones y aprobar pruebas aisladas.
