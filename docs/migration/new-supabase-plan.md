# QuickBite — plan de reconstrucción de Supabase

Fecha de inventario: 2026-10-10  
Repositorio fuente: `aldanajeronimo8-create/QuickBite`  
Rama de trabajo: `migration/new-supabase-baseline`  
Proyecto origen (solo lectura durante el inventario): `cczbbqxunygcowqfrqdm`

## Objetivo y límites

Reconstruir desde cero una nueva base que reproduzca el comportamiento real de QuickBite, optimizada y con seguridad e integridad verificables. La nueva base debe arrancar **sin pedidos ni historial de compras**. Los únicos datos de negocio que se migran son (a) las cuentas explícitamente protegidas y necesarias para operar, y (b) el menú/catálogo y la configuración mínima necesaria para publicarlo. No borrar ni alterar el proyecto de origen durante la preparación. No copiar secretos a este documento. No afirmar que la migración está completa hasta comparar esquema y probar la aplicación.

## Fotografía verificada del origen

Consultas de solo lectura al proyecto de origen:
- 52 tablas públicas; 425 columnas.
- 65 claves foráneas; 361 restricciones CHECK; 152 índices.
- 101 políticas RLS; 160 funciones en `public`; 6 vistas; 50 triggers.
- 20 usuarios en `auth.users`; 20 identidades; 20 perfiles enlazados a Auth.
- 233 perfiles en total: 213 perfiles no enlazados a `auth.users`. Roles actuales: admin 90, parent 97, staff 38, both 6, student 2.
- `protected_admins`: 6 filas; las 6 coinciden con usuarios Auth. Se debe confirmar en código qué cuentas protegidas tienen que mantenerse y migrar exactamente esas; no incluir automáticamente a los otros usuarios.
- Menú/catálogo en la fotografía: 16 productos disponibles, 5 categorías; 0 filas en `weekly_menu_items`, `product_nutrition`, `product_allergens` y tablas de horarios de descansos. Por tanto, no afirmar que hay un menú semanal programado para copiar: hay que conservar los 16 productos y 5 categorías y reconstruir la programación/configuración vacía para cargar el menú nuevo.
- 45 pedidos y 45 líneas de pedido en la fotografía actual. **Ningún pedido ni línea de pedido se copiará** a la base nueva.
- 5 cuentas de billetera; ninguna huérfana respecto a Auth. La nueva base empezará sin saldos ni movimientos heredados, salvo que el usuario cambie expresamente esta instrucción.
- `admin_notifications`: aproximadamente 412.750 filas; se ha observado previamente que 362.926 son huérfanas. No copiar notificaciones históricas.
- `system_audit_logs`: 8.107 filas; `audit_logs`: 583; `system_health_checks`: 3.122; `api_rate_limits`: 3.043. No copiar historial de auditoría, telemetría ni límites de API.
- Un bucket de Storage `quickbite-branding`, límite configurado 2 MiB, sin objetos en el recuento actual. Comprobar si la app necesita sus archivos; si no hay objetos, reconstruir solo la configuración y las políticas necesarias.
- La base origen aparece activa y en región `us-east-2`. No asumir que será la mejor región para el nuevo proyecto sin revisar latencia, disponibilidad y coste.

Estos recuentos son una instantánea; repetirlos antes de cualquier extracción. Se usan para validar la limpieza del destino, no para replicar el historial.

## Alcance exacto de los datos

### A. Sí migrar: cuentas intocables
- Migrar únicamente las cuentas que el código y la configuración identifican como protegidas y que el usuario ha decidido conservar.
- Usar `protected_admins` como pista de inventario, no como única prueba de que toda fila debe migrarse. Verificar en el código las protecciones, roles, UUID y rutas de autenticación.
- Trasladar la identidad de forma segura. No copiar sesiones, refresh tokens, OTP, secretos ni contraseñas en texto plano. Si no se puede trasladar un hash de contraseña de forma compatible, preparar un flujo de restablecimiento/reautenticación.
- Crear perfiles mínimos para esas cuentas, con roles legítimos y solo los campos necesarios para la app. No trasladar los 213 perfiles huérfanos ni los demás usuarios automáticamente.
- No copiar preferencias, consentimientos, historial o notificaciones de usuarios antiguos, salvo los datos mínimos que la propia cuenta protegida necesite para operar y que se hayan validado explícitamente.

### B. Sí migrar: menú y catálogo necesario
- Productos y categorías que formen parte del menú que se quiere conservar.
- Precios vigentes, disponibilidad, imágenes/referencias de Storage, nutrición, alérgenos y configuración de inventario estrictamente necesaria para mostrar y vender los productos.
- Menú semanal y relación entre productos y días/horarios; horarios, descansos y configuración de recogida solo en la medida en que el flujo actual los necesite.
- Grados, secciones y cursos solo si son necesarios para validar las cuentas protegidas o el funcionamiento del menú por sección.
- Validar duplicados, productos archivados, precios y relaciones antes de importar. No migrar movimientos históricos de inventario, demanda, resúmenes ni ventas.

### C. No migrar
- `orders`, `order_items`, cancelaciones de pedidos, códigos QR/códigos de recogida históricos y cualquier tabla que represente pedidos pasados.
- Saldos de billetera, transacciones, recargas y otros historiales financieros.
- Notificaciones históricas, comentarios/reseñas/favoritos de usuarios no migrados, recompensas/redenciones/ledger de puntos.
- Auditorías, logs operativos, comprobaciones de salud, límites de API, presencia de usuarios, jobs y datos temporales.
- Perfiles huérfanos y cuentas no protegidas, salvo decisión posterior y justificada del usuario.
- Datos personales históricos que no sean necesarios para las cuentas protegidas y el menú.

**Importante:** que una tabla de pedidos esté vacía no significa que se deba eliminar del esquema. Se recrearán las tablas, relaciones, RPC y reglas de pedidos que la aplicación necesita para realizar compras nuevas; simplemente se importarán cero filas de pedidos. Lo mismo se aplica a tablas de pagos, billeteras y auditoría que sean parte del funcionamiento futuro.

## Criterio de limpieza del destino

Antes de conectar la app, verificar:
- Cero filas en pedidos, líneas, cancelaciones y registros de transacciones históricas.
- Solo cuentas protegidas autorizadas, con correspondencia correcta entre Auth y perfil.
- Catálogo/menú con cantidades, precios, disponibilidad, horarios y relaciones verificadas.
- Ninguna fila de notificación histórica, auditoría o telemetría heredada, a menos que una dependencia técnica justificada requiera un registro de configuración no histórico.
- Tablas de estructura y funciones necesarias presentes aunque empiecen vacías.

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
- Reconciliación del esquema y de los datos que sí se migran: conteos, IDs, claves foráneas y hashes deterministas.
- Pedidos, líneas, cancelaciones y transacciones históricas: cero filas en el destino inicial; probar que se pueden crear pedidos nuevos.
- Cuentas protegidas: migrar únicamente las cuentas confirmadas tras revisar el código y comprobar acceso sin divulgar credenciales.
- Menú/catálogo: verificar los 16 productos y 5 categorías de referencia, precios y disponibilidad. La programación semanal, nutrición/alérgenos y descansos están vacíos en la fotografía actual; mantener el esquema y no inventar filas para ellos.
- Auth: solo las cuentas protegidas acordadas, o plan documentado de reautenticación; ningún secreto en cliente/repo.
- Seguridad: pruebas RLS por rol y revisión de funciones privilegiadas.
- Funcionalidad: login protegido, compra nueva, pagos nuevos, stock, preparación/entrega, administración y menú/horarios.
- Rendimiento: tiempos base antes/después, planes de consultas críticas y carga de notificaciones controlada.
- Rollback: mantener el origen intacto hasta completar pruebas y una ventana de aceptación. Cambiar variables de entorno solo después de aprobar los controles.

## Bloqueos actuales

- No se ha creado todavía el nuevo proyecto Supabase: primero debe consultarse el coste y recibir confirmación explícita del usuario.
- No se ha extraído ni copiado información personal.
- No se ha borrado ni modificado ningún dato de negocio del origen.
- El PR #62 y la limpieza de notificaciones no forman parte de una autorización para borrar datos.
- La nueva base no debe conectarse a la app hasta resolver la deriva de migraciones y aprobar pruebas aisladas.
