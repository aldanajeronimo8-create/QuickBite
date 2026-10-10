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

La cuenta de Supabase destino ya está conectada y se ha reconstruido allí el esquema público. Comparación mediante la herramienta de tablas: **52 tablas en origen y 52 en destino, sin tablas públicas ausentes ni adicionales**. En el destino se verificaron 101 políticas RLS, seis vistas, 33 triggers, y se restauró parte de las rutinas; el último recuento observado fue 103 funciones públicas frente a 160 en origen. Hay cinco categorías y 16 productos disponibles, copiados desde el catálogo de origen.

El destino sigue aislado y **no está conectado a la aplicación**. No se han copiado identidades ni perfiles: `auth.users`, `profiles` y `protected_admins` continúan vacíos. Tampoco se copiaron pedidos ni ítems de pedidos. La función de fan-out de notificaciones de auditoría y su trigger siguen pendientes. El inicio de sesión aún no se ha probado y no puede declararse aprobado.

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
- Falta **1 trigger** de auditoría relacionado con las notificaciones.
- Los asesores de seguridad todavía reportan funciones `SECURITY DEFINER` ejecutables por usuarios autenticados; requieren revisión por función, no concesiones globales.
- Los asesores de rendimiento reportan 17 claves foráneas sin índice de cobertura, 38 políticas con llamadas de Auth que pueden optimizarse y cuatro grupos de índices duplicados. No se han eliminado índices ni modificado políticas a ciegas.
- No hay todavía una operación autorizada disponible en las herramientas conectadas para transferir las seis identidades Auth de forma segura. No se han copiado contraseñas, hashes, sesiones ni secretos.

La base de origen no se ha modificado. Este documento no incluye correos, UUID ni secretos.
