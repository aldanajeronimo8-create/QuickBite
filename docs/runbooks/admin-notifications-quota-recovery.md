# Recuperación segura de cuota: notificaciones administrativas

**Proyecto afectado:** QuickBite (`cczbbqxunygcowqfrqdm`), plan Free.  
**Diagnóstico inicial:** 2026-10-10.  
**Estado de ejecución:** la corrección está versionada en una migración; la limpieza histórica NO se ha ejecutado. No se han modificado cuentas ni filas de auditoría.

## Hallazgos confirmados

- Tamaño informado por PostgreSQL: aproximadamente 733 MB.
- `public.admin_notifications`: aproximadamente 320 MB y unas 404.000 filas.
- Un recuento agrupado encontró 359.696 notificaciones asociadas a 85 perfiles con rol administrativo que no tienen fila correspondiente en `auth.users`.
- Se encontraron aproximadamente 44.606 notificaciones asociadas a perfiles que sí tienen fila en `auth.users`. Esas notificaciones se deben conservar.
- La función `public.fanout_admin_notification_from_audit()` crea una notificación por cada perfil `admin` o `both` (salvo el actor), sin comprobar que el perfil esté activo ni que tenga una cuenta de autenticación no eliminada/no bloqueada. El trigger está conectado a las inserciones en `public.system_audit_logs`.

Las cifras de tamaño son aproximadas y deben medirse otra vez antes y después del mantenimiento. Los recuentos provienen de consultas de diagnóstico; no se debe usar una cifra estimada como condición única para borrar datos.

## Corrección permanente

La migración `20261010183500_prevent_orphan_admin_notifications.sql` actualiza el disparador para crear notificaciones solo cuando:
- el perfil tiene rol `admin` o `both`;
- `profiles.active = true`;
- existe una fila correspondiente en `auth.users` que no está eliminada ni bloqueada;
- el destinatario no es quien originó el evento.

La migración no borra notificaciones históricas, perfiles ni cuentas.

## Procedimiento con respaldo externo obligatorio

**No crear una tabla de respaldo dentro del mismo proyecto.** Eso duplicaría el uso de espacio. Exportar la tabla a un equipo o almacenamiento privado fuera de Supabase, mantener el archivo fuera del repositorio Git y no incluir credenciales en comandos guardados.

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
7. Durante una ventana de mantenimiento, preservar y reconstruir la tabla transaccionalmente: mantener todas las filas cuya identidad todavía exista en `auth.users`, retirar solo notificaciones que ya no pertenecen a ninguna identidad Auth y confirmar la transacción únicamente después de comparar los recuentos. No eliminar ni modificar `profiles`, `auth.users`, `system_audit_logs` ni `audit_logs`.

   Ejecutar la reconstrucción solo después de completar y verificar la exportación externa. El bloque conserva intactas todas las notificaciones con una fila en `auth.users`, y aborta si los recuentos no cuadran:

   ```sql
   BEGIN;
   LOCK TABLE public.admin_notifications IN ACCESS EXCLUSIVE MODE;

   CREATE TEMP TABLE admin_notifications_keep ON COMMIT DROP AS
   SELECT n.id, n.admin_user_id, n.section, n.title, n.body, n.entity_type,
          n.entity_id, n.metadata, n.created_at, n.read_at
   FROM public.admin_notifications n
   WHERE EXISTS (
     SELECT 1 FROM auth.users u WHERE u.id = n.admin_user_id
   );

   DO $check$
   DECLARE
     v_total bigint;
     v_keep bigint;
     v_orphan bigint;
   BEGIN
     SELECT count(*) INTO v_total FROM public.admin_notifications;
     SELECT count(*) INTO v_keep FROM pg_temp.admin_notifications_keep;
     SELECT count(*) INTO v_orphan
     FROM public.admin_notifications n
     WHERE NOT EXISTS (
       SELECT 1 FROM auth.users u WHERE u.id = n.admin_user_id
     );

     IF v_total <> v_keep + v_orphan THEN
       RAISE EXCEPTION 'Notification counts changed during preparation; aborting cleanup';
     END IF;
     IF v_orphan = 0 THEN
       RAISE EXCEPTION 'No orphan notifications found; aborting cleanup';
     END IF;
   END;
   $check$;

   TRUNCATE TABLE public.admin_notifications;
   INSERT INTO public.admin_notifications(
     id, admin_user_id, section, title, body, entity_type,
     entity_id, metadata, created_at, read_at
   )
   SELECT id, admin_user_id, section, title, body, entity_type,
          entity_id, metadata, created_at, read_at
   FROM pg_temp.admin_notifications_keep;

   DO $check$
   DECLARE
     v_expected bigint;
     v_actual bigint;
   BEGIN
     SELECT count(*) INTO v_expected FROM pg_temp.admin_notifications_keep;
     SELECT count(*) INTO v_actual FROM public.admin_notifications;
     IF v_expected <> v_actual THEN
       RAISE EXCEPTION 'Preserved notification count mismatch; transaction must roll back';
     END IF;
   END;
   $check$;
   COMMIT;
   ```

   Mantener el proyecto en mantenimiento hasta verificar los recuentos y el tamaño tras el `COMMIT`. Al hacer `TRUNCATE` y reinsertar únicamente las filas preservadas, se evita depender de `VACUUM FULL` para recuperar el espacio de esa tabla.
8. Verificar inmediatamente: recuento total, recuento de notificaciones conservadas, tamaño de `public.admin_notifications`, tamaño total de la base y posibilidad de crear una notificación desde una cuenta administrativa real. Si algo falla antes de confirmar la transacción, hacer `ROLLBACK`. Conservar el CSV hasta terminar la validación de producción.

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
- Para restaurar desde el CSV si fuera necesario, detener escrituras de notificaciones, restaurar usando las diez columnas enumeradas y validar IDs/recuentos antes de reabrir el uso. No restaurar encima de filas existentes sin resolver previamente los IDs duplicados.
- No se debe borrar historial de auditoría como estrategia de ahorro. Si el tamaño posterior continúa por encima de la cuota, revisar la página Usage/Disk del proyecto y los objetos grandes restantes; el tamaño físico final debe volver a medirse, no inferirse solo del número de filas borradas.
