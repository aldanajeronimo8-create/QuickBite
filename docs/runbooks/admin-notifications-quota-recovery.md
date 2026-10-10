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

La rama incluye el exportador `scripts/backup-admin-notifications.mjs`, invocable después de descargar el código con `pnpm backup:admin-notifications`. La exportación es de solo lectura, por páginas, dentro de una transacción `REPEATABLE READ READ ONLY`; crea un CSV y un manifiesto con el recuento y el SHA-256 fuera del repositorio. No se ha ejecutado desde este entorno porque no tengo acceso a la contraseña de conexión privada del usuario y el respaldo debe quedar bajo su control fuera de Supabase.

Pasos locales:
1. Usa el código actualizado de `main` después de fusionar el PR de respaldo.
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

1. En el Dashboard de Supabase, revisar si el proyecto está en modo de solo lectura. No intentar limpiezas hasta contar con un respaldo externo verificable y una ventana de mantenimiento.
2. Con una conexión de base de datos configurada en el equipo operador, abrir `psql` contra el proyecto correcto. No pegar la cadena de conexión ni la contraseña en un issue, PR o chat.
3. Antes de exportar, registrar los recuentos:
   ```sql
   SELECT count(*) AS total_notifications FROM public.admin_notifications;

   SELECT count(*) AS notifications_without_auth_account
   FROM public.admin_notifications n
   WHERE NOT EXISTS (
     SELECT 1 FROM auth.users u WHERE u.id = n.admin_user_id
   );

   SELECT count(*) AS notifications_with_auth_account
   FROM public.admin_notifications n
   WHERE EXISTS (
     SELECT 1 FROM auth.users u WHERE u.id = n.admin_user_id
   );
   ```
4. En `psql`, exportar **todas** las notificaciones a un archivo CSV fuera del proyecto. La salida `COPY n` indica cuántas filas se exportaron:
   ```text
   \copy (SELECT id, admin_user_id, section, title, body, entity_type, entity_id, metadata, created_at, read_at FROM public.admin_notifications ORDER BY id) TO 'admin_notifications_full_backup_20261010.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
   ```
5. Verificar que `COPY n` coincide con el total consultado, calcular una suma SHA-256 del archivo y guardar la suma y la fecha junto al respaldo. Abrir/probar que el archivo existe, no está vacío y es legible. Guardar una segunda copia privada fuera del equipo original. El respaldo no está listo si solo se ejecutó la consulta o si la exportación no informó el número de filas.
6. Confirmar que la migración correctiva se ha aplicado a la base conectada. Si el proyecto está en solo lectura, seguir el procedimiento que muestre el Dashboard de Supabase; no cambiar de proyecto ni borrar datos reales para esquivar el bloqueo.
7. Antes de aplicar la limpieza, cierra temporalmente las operaciones administrativas que puedan borrar usuarios o modificar notificaciones y ejecuta primero el modo de simulación del script. No uses la limpieza manual SQL descrita en notas antiguas; el script actual además coteja los IDs huérfanos exactos con el respaldo:

   ```bash
   pnpm cleanup:orphan-admin-notifications -- --manifest "../quickbite-private-backups/<archivo>.manifest.json" --csv "../quickbite-private-backups/<archivo>.csv"
   ```

8. Comprueba que el modo de simulación termina en `DRY RUN`, que el recuento coincide con el manifiesto y que tienes dos copias privadas del CSV y el manifiesto. Para aplicar la limpieza transaccional, en la misma ventana de mantenimiento ejecuta:

   ```bash
   pnpm cleanup:orphan-admin-notifications -- --manifest "../quickbite-private-backups/<archivo>.manifest.json" --csv "../quickbite-private-backups/<archivo>.csv" --apply
   ```

   El script vuelve a cotejar el hash de los IDs antes de adquirir el bloqueo y dentro de la transacción. Exige confirmaciones interactivas del respaldo externo y del recuento; solo entonces reconstruye la tabla conservando todas las filas cuyo destinatario sigue teniendo una fila en `auth.users`. Si un chequeo previo al `COMMIT` falla, la transacción se revierte. No elimina perfiles, cuentas Auth ni filas de auditoría.

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
