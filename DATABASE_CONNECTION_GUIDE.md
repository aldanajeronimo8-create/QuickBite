# Database Connection Guide

## Recommendation

Use Supabase Postgres for QuickBite.

Why:

- Native PostgreSQL with strong relational integrity.
- Supabase Auth integrates with `auth.uid()` for RLS.
- Row Level Security protects tables even when accessed from the browser.
- Storage and Realtime can be enabled without changing the architecture.
- The project already includes Supabase migrations, client config and auth/data adapters.

## Create Your Supabase Project

1. Create a new Supabase project in your own account.
2. Copy the Project URL and anon/public key.
3. Create `.env` from `.env.example`.
4. Set:

```bash
VITE_RUNTIME_MODE=supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_PUBLIC_APP_URL=https://your-domain.com
VITE_SUPABASE_REALTIME_ENABLED=true
```

Never place `SUPABASE_SERVICE_ROLE_KEY` in a `VITE_*` variable.

## Apply Database Schema

Install and authenticate the Supabase CLI, then run:

```bash
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

The canonical schema is:

```text
supabase/migrations/20260609000000_initial.sql
```

## First Administrator

Admins are intentionally not created from the browser in Supabase mode.

Use the secure Edge Function bootstrap flow:

1. Deploy `supabase/functions/server`.
2. Set server-only secrets:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
INSTALL_TOKEN=long-random-one-time-token
ALLOWED_ORIGINS=https://your-domain.com
QUICKBITE_API_PREFIX=/api
```

3. Call:

```bash
curl -X POST "https://your-function-domain/api/bootstrap-admin" \
  -H "content-type: application/json" \
  -H "x-install-token: long-random-one-time-token" \
  -d '{"email":"admin@example.com","password":"replace-with-strong-password","fullName":"Admin"}'
```

4. Rotate or remove `INSTALL_TOKEN` after creating the first admin.

## Production Data Flow

- Admin login: Supabase Auth + `profiles.role = admin`.
- Student registration/login: Supabase Auth + `profiles.role = student`.
- Products/categories/orders: Supabase tables with RLS.
- Order creation: `public.create_order_tx(...)` RPC validates stock and calculates totals in Postgres.
- Realtime: `categories`, `products`, `orders` and `order_items` are added to `supabase_realtime`; the app subscribes to Postgres Changes and refreshes data without a page reload.
- Audit log: writes local fallback and `public.audit_logs` when Supabase is enabled.

## Realtime Validation

1. Open the admin panel in one browser.
2. Open the student menu in another browser or incognito window.
3. From admin, edit product stock or hide/show a product.
4. The student menu should update automatically within a moment.
5. From the student menu, place an order.
6. Admin orders/payments should refresh without manually reloading.

## Required Supabase Auth Settings

In Supabase Dashboard:

- Set Site URL to `VITE_PUBLIC_APP_URL`.
- Add local/staging/production redirect URLs.
- Enable email confirmation for production.
- Configure SMTP before production launch.

## Go-Live Checklist

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `supabase db push`
- Create first admin via bootstrap.
- Disable or rotate setup token.
- Configure backups/PITR in Supabase.
- Configure Sentry/PostHog/OpenTelemetry provider.
