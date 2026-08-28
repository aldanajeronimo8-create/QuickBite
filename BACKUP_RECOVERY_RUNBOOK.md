# Copias de seguridad y recuperación de QuickBite

QuickBite crea una copia diaria de PostgreSQL mediante `.github/workflows/backup.yml` a las **07:00 UTC** (02:00 en Colombia, UTC-5). Cada ejecución genera un archivo PostgreSQL en formato personalizado (`.dump`) y su SHA-256 (`.dump.sha256`), que se conservan como artifact privado de GitHub Actions durante 30 días.

## Configuración única

En GitHub abre **Settings → Secrets and variables → Actions** y crea el secreto `SUPABASE_DB_URL`. Su valor es la cadena de conexión PostgreSQL de Supabase con permisos de lectura para `pg_dump`. No la pegues en archivos del repositorio, variables `VITE_*`, logs ni documentación pública.

Para la monitorización crea además estos secretos:

- `QUICKBITE_HEALTH_URL`: URL de la función `quickbite-health`, por ejemplo `https://<project-ref>.supabase.co/functions/v1/quickbite-health`.
- `QUICKBITE_HEALTH_TOKEN`: el mismo valor secreto configurado como `HEALTH_CHECK_TOKEN` en Supabase. Es opcional solo si se deja la función pública; se recomienda configurarlo.
- `QUICKBITE_ALERT_WEBHOOK_URL`: opcional. Un webhook compatible con JSON para avisos de backup o health check fallidos.

La función `quickbite-health` usa `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` del entorno seguro de Edge Functions. No necesita ni acepta claves del frontend.

## Verificar un backup

1. Ejecuta **Actions → Supabase backup → Run workflow**.
2. Confirma que el job termina en `success`.
3. Descarga el artifact `quickbite-postgres-<run-id>` y verifica ambos archivos:

```powershell
pnpm backup:verify -- --file .\quickbite-AAAA-MM-DDTHH-MM-SSZ.dump
```

La verificación compara el SHA-256 y ejecuta `pg_restore --list`; no modifica ninguna base de datos.

## Recuperación controlada

No existe restauración automática. Ante un incidente:

1. Pausa los cambios operativos y conserva una copia del estado actual para investigación.
2. Elige el artifact más reciente cuyo SHA-256 sea válido.
3. Crea primero una base/proyecto de recuperación separado.
4. Restaura y prueba allí el backup con el script, incluyendo pedidos, inventario y autenticación relevante.
5. Comprueba las tablas principales, RLS, el health check y las funciones RPC antes de decidir una restauración productiva.
6. Solo un operador autorizado puede restaurar producción usando las dos confirmaciones explícitas del script.

Ejemplo de recuperación de prueba:

```powershell
$env:QUICKBITE_RESTORE_CONFIRM = 'RESTORE quickbite-AAAA-MM-DDTHH-MM-SSZ.dump'
pnpm backup:restore -- --file .\quickbite-AAAA-MM-DDTHH-MM-SSZ.dump --database 'postgresql://usuario:clave@host:5432/postgres' --confirm-restore
```

El script bloquea destinos `*.supabase.co` salvo que se agregue `--allow-production`, y siempre valida el SHA-256 antes de invocar `pg_restore`. No uses ese modificador hasta completar la prueba de recuperación y obtener autorización para la base de producción.

## Checklist posterior

- Ejecutar el health check y confirmar HTTP 200.
- Iniciar sesión con una cuenta administrativa y una estudiantil.
- Confirmar que categorías, productos, stock y pedidos son coherentes.
- Confirmar que el panel administrativo muestra los últimos checks de salud.
- Revisar `system_audit_logs` y `system_health_checks` como administrador.
- Registrar la causa del incidente y conservar el artifact usado.
