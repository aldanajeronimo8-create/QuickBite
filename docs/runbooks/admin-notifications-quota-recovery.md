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

## Procedimiento de limpieza automatizada con respaldo externo cifrado

La limpieza ya no requiere ejecutar comandos desde el PC. El workflow `.github/workflows/cleanup-orphan-admin-notifications.yml` está diseñado para ejecutarse solo después de una CI exitosa en `main` cuyo mensaje de commit contenga el marcador explícito `[RUN-ORPHAN-ADMIN-NOTIFICATION-CLEANUP]`. Un PR normal, una CI de una rama de trabajo o una CI fallida no autorizan la limpieza.

1. Obtener con Supabase Auth Admin API la lista de IDs de cuentas reales.
2. Exportar por páginas únicamente las filas de `public.admin_notifications` cuyo destinatario no aparece en `auth.users`, en formato JSONL y sin escribir una copia en texto claro a disco.
3. Comprimir y cifrar el respaldo con AES-256-GCM. La clave se deriva con HKDF-SHA-256 del secreto `SUPABASE_SERVICE_ROLE_KEY`; el secreto nunca se registra. El manifiesto guarda tamaño, checksum del archivo cifrado, recuento, cantidad de destinatarios, huella SHA-256 ordenada de los IDs, salt, IV y tag de autenticación. El script vuelve a descifrar el archivo en el runner y compara recuento y huella antes de continuar.
4. Subir el respaldo cifrado y el manifiesto como un artefacto de GitHub Actions con retención de 90 días. La limpieza no empieza si la exportación, su autotest de descifrado o la subida del artefacto fallan.
5. Después de confirmar la subida del artefacto, invocar `public.admin_cleanup_orphan_admin_notifications(bigint,text)` con el recuento y la huella del manifiesto. La función bloquea la tabla, vuelve a calcular los IDs huérfanos dentro de la transacción y aborta si el conjunto cambió desde el respaldo.
6. Si la huella coincide, reconstruir la tabla conservando todas las notificaciones cuyo destinatario mantiene una fila en `auth.users`. La función comprueba los recuentos antes del `COMMIT` y retorna un resultado verificable. Solo elimina notificaciones; no elimina perfiles, cuentas Auth, pedidos, movimientos ni filas de auditoría.
7. Tras la limpieza, la automatización consulta de nuevo las notificaciones huérfanas. Se considera correcta solo si quedan cero. El artefacto cifrado queda disponible en la ejecución de GitHub Actions durante su retención configurada.

Si la exportación no termina, no se sube el artefacto, la API de Supabase no permite escribir, o la huella no coincide, la operación se detiene sin confirmar la limpieza. El artefacto cifrado podría quedar disponible si la subida ocurrió antes del fallo de la base. No se habilitan limpiezas alternativas manuales.

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
