# Backup And Recovery Runbook

## Recommended Baseline

Use Supabase managed Postgres backups plus a scheduled logical export for independent recovery.

## Environments

- Development: disposable Supabase project or local Supabase.
- Staging: separate Supabase project with production-like RLS and seed data.
- Production: dedicated Supabase project with backups/PITR enabled.

## Backup Strategy

1. Enable Supabase automatic backups for the production project.
2. Enable PITR if the selected Supabase plan supports it.
3. Schedule a daily logical export:

```bash
pg_dump "$SUPABASE_DB_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="quickbite-$(date +%F).dump"
```

4. Store encrypted exports in a storage provider outside the production Supabase project.
5. Keep at least:
   - 7 daily backups
   - 4 weekly backups
   - 12 monthly backups

## Restore Drill

Run once per month:

1. Create a temporary Supabase project.
2. Restore the latest dump:

```bash
pg_restore \
  --dbname "$RESTORE_DB_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  quickbite-latest.dump
```

3. Apply pending migrations with `supabase db push`.
4. Run smoke tests:
   - Admin login
   - Student login
   - Product read
   - Order creation
   - Stock decrement
   - Admin order status update

## Disaster Recovery Targets

- RPO target: 24 hours with daily exports, lower if PITR is enabled.
- RTO target: 2 hours for managed Supabase restore, 4 hours for logical restore.

## Incident Checklist

- Freeze writes if data corruption is ongoing.
- Capture current migration version and incident timestamp.
- Restore to staging first.
- Validate RLS and order totals.
- Promote restored database only after smoke tests pass.
