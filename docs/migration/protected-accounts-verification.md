# QuickBite — verificación de cuentas protegidas

Fecha: 2026-10-10  
Repositorio: `aldanajeronimo8-create/QuickBite`  
Rama: `migration/new-supabase-baseline`

## Evidencia revisada

- `src/lib/protectedAccounts.ts` contiene una allowlist explícita de **6 identidades protegidas**. La función normaliza correo (trim + minúsculas) y el test `src/lib/protectedAccounts.test.ts` exige que sean seis.
- `supabase/migrations/20260710000003_protected_admins.sql` crea `public.protected_admins`, protege la edición/eliminación de los perfiles y bloquea cambios de Auth para identidades incluidas. La migración inicial inserta cinco cuentas administrativas.
- `supabase/migrations/20260902184000_protect_e2e_verification_account.sql` agrega la cuenta de verificación E2E como protegida en la tabla del servidor.
- `supabase/migrations/20260828000004_allow_protected_admin_sign_in.sql` permite únicamente las actualizaciones técnicas necesarias para el inicio de sesión; el resto de los campos de Auth queda protegido.
- `supabase/migrations/20260901021550_protect_quickbite_student_account.sql` también impide eliminar el perfil de la cuenta de verificación QuickBite.

## Conclusión

La fuente de verdad de la protección no es una única tabla: se compone de la allowlist del cliente, la tabla `protected_admins` y triggers/funciones de base de datos. La lista de seis identidades protegidas incluye una cuenta de verificación E2E que no debe suponerse automáticamente una cuenta administrativa. **Se debe conservar su rol real**, no convertir todas las identidades protegidas a `admin`.

La fotografía del origen indicó seis filas en `protected_admins` y seis correspondencias con usuarios de Auth. Antes de copiar, volver a consultar únicamente los campos mínimos necesarios (UUID, correo normalizado, rol y presencia de perfil) en el proyecto origen y comparar con los seis miembros de la allowlist. No registrar correos, UUID ni credenciales en los documentos de migración ni en logs públicos.

## Estado actualizado del destino (2026-10-10)

La cuenta de Supabase destino está activa y se ha reconstruido allí el esquema público. Comparación mediante la herramienta de tablas: **52 tablas en origen y 52 en destino, sin tablas públicas ausentes ni adicionales**. En el destino se verificaron 101 políticas RLS, seis vistas, los 34 triggers personalizados del esquema público, y 103 funciones públicas frente a 160 en origen. Hay cinco categorías y 16 productos disponibles, copiados desde el catálogo de origen.

El destino sigue aislado y **no está conectado a la aplicación**. No se han copiado identidades ni perfiles: `auth.users`, los perfiles administrativos activos y `protected_admins` continúan vacíos. Tampoco se copiaron pedidos ni ítems de pedidos. La función de fan-out de notificaciones de auditoría y su trigger ya existen y el trigger está habilitado, pero su comportamiento no se ha validado de extremo a extremo. El inicio de sesión aún no se ha probado y no puede declararse aprobado.

## Regla para la base nueva

1. Mantener el esquema de protección equivalente (tabla, políticas, triggers y funciones revisadas) antes de migrar las identidades.
2. Transferir solo las seis identidades protegidas verificadas, conservando sus roles legítimos y relaciones necesarias.
3. No copiar sesiones, refresh tokens, OTP ni secretos. No escribir contraseñas ni hashes en archivos, PR, logs o variables del cliente.
4. Si no se puede transferir el material de autenticación de manera segura y compatible, recrear las identidades mediante un procedimiento controlado de reautenticación/restablecimiento; no improvisar contraseñas.
5. Probar que las cuentas protegidas pueden iniciar sesión y que no pueden editarse/eliminarse desde la app, mientras que la administración normal sigue aplicando autorización por rol.
6. Mantener los demás usuarios y los 213 perfiles huérfanos fuera de la migración.
7. No conectar la app ni hacer corte de tráfico hasta restaurar/revisar las funciones pendientes, resolver el trigger de auditoría, revisar las alertas de seguridad y rendimiento, y completar las pruebas de autorización.

## Bloqueos actuales

- Quedan **57 funciones públicas** por revisar/restaurar (103 observadas de 160 del origen).
- El trigger de auditoría de notificaciones está presente y habilitado, pero falta una prueba de integración que confirme la generación correcta de notificaciones.
- Los asesores de seguridad todavía reportan funciones `SECURITY DEFINER` ejecutables por usuarios autenticados; requieren revisión por función, no concesiones globales.
- Se añadieron índices para las 17 claves foráneas que carecían de cobertura y se quitaron cinco índices duplicados verificados. Los asesores ya no informan claves foráneas sin índice ni duplicados. Quedan 38 hallazgos `auth_rls_initplan`, 63 casos `multiple_permissive_policies` que requieren revisión individual y 90 índices marcados como no usados; estos últimos no se deben eliminar automáticamente en una base recién creada sin carga de trabajo representativa.
- No hay todavía una operación autorizada disponible en las herramientas conectadas para transferir las seis identidades Auth de forma segura. No se han copiado contraseñas, hashes, sesiones ni secretos.

La base de origen no se ha modificado. Este documento no incluye correos, UUID ni secretos.


## Verificación real del gate administrativo (2026-10-10)

Se publicó y volvió a consultar la función `qb-admin-migration-gate`. La versión activa es la **4**. La función no realiza migraciones ni altera cuentas.

La prueba en vivo de CI observó:
- `GET /health`: HTTP 200; solo devuelve indicadores booleanos de configuración, sin valores de secretos.
- `GET /status` sin token: HTTP 401.
- `GET /health` con un origen no permitido: HTTP 403.
- `destinationRuntimeConfigured: true`.
- `allowedOriginsConfigured: false`.
- `sourceConnectionConfigured: false`.
- `migrationExecuted: false`.

La autorización del endpoint `/status` se valida dentro de la función mediante `auth.getUser(token)` y la comprobación de que el perfil existe, está activo y tiene rol `admin` o `both`. La verificación JWT de la plataforma está deshabilitada para permitir que las solicitudes de preflight lleguen al manejador; esto no sustituye la validación del token que hace el código en `/status`. La ruta pública `/health` no muestra credenciales, correos, UUID ni filas.

**Bloqueo real encontrado:** faltan las variables de entorno `QB_ADMIN_ALLOWED_ORIGINS`, `QB_SOURCE_URL` y `QB_SOURCE_SECRET_KEY`. Por tanto, la función todavía no tiene orígenes de navegador permitidos ni conexión configurada al proyecto de origen. Además, el destino sigue sin usuarios Auth, perfiles administrativos activos ni filas en `protected_admins`; no hay una identidad administrativa de destino con la que completar el control de acceso.

El último CI confirmó que **Quality pasó**. El smoke de la función falla intencionalmente por esas dos configuraciones ausentes. La suite E2E también se detiene en el guard antes de provisionar usuarios o datos porque no está configurado el destino aislado de pruebas. No se debe habilitar la migración de cuentas hasta resolver estos bloqueos.
