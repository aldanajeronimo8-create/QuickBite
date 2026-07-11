# Conectar Supabase definitivamente

Este proyecto no requiere Supabase CLI global. Usa el script local:

```powershell
npm.cmd run supabase:connect
```

El script pide:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_DB_URL` opcional, pero recomendado para aplicar migraciones
- `SUPABASE_SERVICE_ROLE_KEY` opcional para bootstrap server-side

Luego:

```powershell
npm.cmd run dev:local
```

## Donde conseguir los valores

En Supabase Dashboard:

- Project URL: `Settings > API > Project URL`
- Anon key: `Settings > API > anon public`
- Service role key: `Settings > API > service_role`
- DB URL: `Settings > Database > Connection string`

## Seguridad

No subas `.env` a GitHub. Ya está ignorado por `.gitignore`.

La `anon key` puede ir al frontend. La `service_role key` y `SUPABASE_DB_URL` no deben exponerse en hosting público ni variables `VITE_*`.
