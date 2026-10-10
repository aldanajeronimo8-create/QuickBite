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

## Regla para la base nueva

1. Crear primero el esquema de protección equivalente (tabla, políticas, triggers y funciones revisadas).
2. Transferir solo las seis identidades protegidas verificadas, conservando sus roles legítimos y relaciones necesarias.
3. No copiar sesiones, refresh tokens, OTP ni secretos. No escribir contraseñas ni hashes en archivos, PR, logs o variables del cliente.
4. Si no se puede transferir el material de autenticación de manera segura y compatible, recrear las identidades mediante un procedimiento controlado de reautenticación/restablecimiento; no improvisar contraseñas.
5. Probar que las cuentas protegidas pueden iniciar sesión y que no pueden editarse/eliminarse desde la app, mientras que la administración normal sigue aplicando autorización por rol.
6. Mantener los demás usuarios y los 213 perfiles huérfanos fuera de la migración.

## Bloqueos

- La cuenta Supabase destino todavía no está conectada/seleccionada. No crear proyecto, aplicar DDL, importar cuentas ni cambiar variables de la aplicación hasta que el usuario conecte la otra cuenta y se confirme el proyecto destino.
- Este documento no contiene identificadores personales ni secretos; no modifica la base de datos.
