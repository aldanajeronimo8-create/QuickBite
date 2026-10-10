# Recuperación segura de cuota: notificaciones administrativas

**Proyecto afectado:** QuickBite (`cczbbqxunygcowqfrqdm`), plan Free.  
**Diagnóstico inicial:** 2026-10-10.  
**Estado de ejecución:** la corrección está versionada en una migración; la limpieza histórica NO se ha ejecutado. No se han modificado cuentas ni filas de auditoría.

## Hallazgos confirmados

- Tamaño informado por PostgreSQL: aproximadamente 733 MB.
- `public.admin_notifications`: aproximadamente 321 MB y unas 408.000 filas (medición más reciente durante la revisión).
- Un recuento agrupado encontró 359.696 notificaciones asociadas a 85 perfiles con rol administrativo que no tienen fila correspondiente en `auth.users`.
- Se encontraron aproximadamente 44.606 notificaciones asociadas a perfiles que sí tienen fila en `auth.users`. Esas notificaciones se deben conservar.
- La función `public.fanout_admin_notification_from_audit()` crea una notificación por cada perfil `admin` o `both` (salvo el actor), sin comprobar que el perfil esté activo ni que tenga una cuenta de autenticación no eliminada/no bloqueada. El trigger está conectado a las inserciones en `public.system_audit_logs`.

Las cifras de tamaño son aproximadas y deben medirse otra vez antes y después del mantenimiento. Los recuentos provienen de consultas de diagnóstico; no se debe usar una cifra estimada como condición única para borrar datos.

## Corrección permanente

La migración `20261010190601_prevent_orphan_admin_notifications.sql` actualiza el disparador para crear notificaciones solo cuando:
- el perfil tiene rol `admin` o `both`;
- `profiles.active = true`;
- existe una fila correspondiente en `auth.users` que no está eliminada ni bloqueada;
- el destinatario no es quien originó el evento.

La migración no borra notificaciones históricas, perfiles ni cuentas.

## Procedimiento con respaldo externo obligatorio

**No crear una tabla de respaldo dentro del mismo proyecto.** Eso duplicaría el uso de espacio. Exportar la tabla a un equipo o almacenamiento privado fuera de Supabase, mantener el archivo fuera del repositorio Git y no incluir credenciales en comandos guardados.

El repositorio incluye el exportador `scripts/backup-admin-notifications.mjs`, invocable después de descargar el código con `pnpm backup:admin-notifications`. La exportación es de solo lectura, por páginas, dentro de una transacción `REPEATABLE READ READ ONLY`; crea un CSV y un manifiesto con el recuento y el SHA-256 fuera del repositorio. No se ha ejecutado desde este entorno porque no tengo acceso a la contraseña de conexión privada del usuario y el respaldo debe quedar bajo su control fuera de Supabase.

Pasos locales:
1. Actualiza tu copia local con el `main` que ya incluye el exportador y el limpiador.
2. En el `.env` local (ignorado por Git), configura `SUPABASE_PROJECT_REF=cczbbqxunygcowqfrqdm` y `SUPABASE_DB_URL` con la cadena de conexión PostgreSQL del proyecto. No publiques ni compartas esa cadena.
3. Ejecuta `pnpm install --frozen-lockfile` y después `pnpm backup:admin-notifications`.
4. El comando debe terminar mostrando `RESPALDO VERIFICADO`, el mismo número de filas exportadas y esperado, la ruta del CSV y un SHA-256. Si no se completa sin errores, no uses el archivo parcial para autorizar la limpieza.
5. Guarda una segunda copia privada en otro destino y conserva ambos archivos CSV y manifiesto hasta cerrar la validación. Solo entonces continúa.

Para validar sin borrar nada, ejecuta en seco:
```bash
pnpm cleanup:orphan-admin-notifications -- --manifest "../quickbite-private-backups/<archivo>.manifest.json" --csv "../quickbite-private-backups/<archivo>.csv"
```
El script verifica el checksum del CSV y compara el hash ordenado de los IDs huérfanos del respaldo con los IDs actuales. Si no coinciden, aborta y pide generar otro respaldo. Si el resultado muestra `DRY RUN` y recuentos coherentes, revisa que las dos copias privadas existan. En la misma ventana de mantenimiento, la ejecución real sería:
```bash
pnpm cleanup:orphan-admin-notifications -- --manifest "../quickbite-private-backups/<archivo>.manifest.json" --csv "../quickbite-private-backups/<archivo>.csv" --apply
```
El modo `--apply` exige confirmar que hay dos copias privadas y escribir una frase de confirmación con el recuento exacto. Bajo bloqueo exclusivo, vuelve a comprobar los IDs huérfanos, reconstruye la tabla dentro de una transacción y verifica recuentos antes del `COMMIT`. Si un chequeo falla, la transacción se revierte.

Antes de usar `--apply`, verifica en el Dashboard que el proyecto permita escrituras y confirma que la migración `20261010190601 / prevent_orphan_admin_notifications` aparece en el registro. Ejecuta la operación en una ventana de mantenimiento, sin cambios de usuarios ni de notificaciones en paralelo. Si el proyecto está en solo lectura, no intentes forzar la limpieza: sigue el procedimiento indicado por Supabase o resuelve primero la cuota.

No ejecutes SQL manual alternativo para borrar la tabla. El exportador automatizado hace una exportación de solo lectura y genera los hashes; el limpiador compara el CSV con su manifiesto y los IDs huérfanos actuales. Si cambió el conjunto de IDs desde el respaldo, la limpieza se cancela y debe repetirse el respaldo. El script requiere confirmar dos copias privadas y una frase con el recuento exacto antes de modificar datos.

## Consulta posterior de control

```sql
SELECT
  count(*) AS remaining_notifications,
  count(*) FILTER (WHERE u.id IS NULL) AS notifications_without_auth_account
FROM public.admin_notifications n
LEFT JOIN auth.users u ON u.id = n.admin_user_id;

SELECT pg_size_pretty(pg_total_relation_size('public.admin_notifications')) AS notification_table_size,
       pg_size_pretty(pg_database_size(current_database())) AS database_size;
```

## Límites y reversión

- La limpieza histórica no debe ejecutarse desde una migración automática: requiere respaldo externo, ventana de mantenimiento y comparación de recuentos antes/después.
- Para restaurar desde el CSV si fuera necesario, detener escrituras de notificaciones y restaurar usando las diez columnas enumeradas, con `FORMAT csv, HEADER true, NULL '\\N'`; validar IDs/recuentos antes de reabrir el uso. No restaurar encima de filas existentes sin resolver previamente los IDs duplicados.
- No se debe borrar historial de auditoría como estrategia de ahorro. Si el tamaño posterior continúa por encima de la cuota, revisar la página Usage/Disk del proyecto y los objetos grandes restantes; el tamaño físico final debe volver a medirse, no inferirse solo del número de filas borradas.
