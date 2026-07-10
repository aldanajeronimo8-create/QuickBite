# QuickBite

QuickBite is a React, TypeScript and Supabase-ready cafeteria ordering/admin app. The codebase is now infrastructure-agnostic: it contains no fixed Supabase project ID, API key, domain, GitHub repository, organization or developer-specific URL.

## Requirements

- Node.js 20+
- npm 11+ or the npm version bundled with Node.js
- Optional: Supabase CLI for production database deployment

## Local Development

```bash
copy .env.example .env
npm install
npm run dev
```

On Windows, prefer `npm.cmd` instead of `npm` because PowerShell can block `npm.ps1` through Execution Policy.

You can also double-click:

```text
start-local.bat
```

The app opens at `http://localhost:5173`.

`npm run dev` is expected to keep running because it is the Vite development server. Stop it with `Ctrl + C`.

QuickBite uses Supabase as the only persistence layer. If Supabase URL/key are missing, the app opens the first-run setup guide instead of falling back to browser storage or demo data.

## Environment

All runtime configuration lives in `.env.example`.

Required for Supabase mode:

```bash
VITE_RUNTIME_MODE=supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_PUBLIC_APP_URL=https://your-domain.com
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend variables. Service-role keys are only for server functions, CI migrations or secure backend jobs.

## First-Run Setup

If `VITE_RUNTIME_MODE=supabase` is enabled without Supabase URL/key, the app shows `/setup`. The setup guide lets an operator connect an existing Supabase project or create one manually, then configure admin bootstrap, domain, email and storage through environment variables.

## Quality Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
```

On Windows, `npm install`, `npm run dev` and `npm run build` automatically execute `npm run patch:esbuild` to avoid `spawn EPERM` when the native esbuild binary is blocked.

## Docker

```bash
cp .env.example .env
docker compose up --build
```

The app is served by Nginx with SPA routing, health check and baseline security headers.

## Supabase

Apply the schema from `supabase/migrations/20260609000000_initial.sql`.
For order hiding in the admin interface, also apply `supabase/migrations/20260709000002_order_admin_hidden.sql`.
For product admin actions and password fixes, apply `supabase/migrations/20260709000003_admin_product_crud_and_password.sql`.

If `SUPABASE_DB_URL` is configured in `.env`, you can apply every migration in order with:

```bash
npm run supabase:migrate
```

See `DATABASE_CONNECTION_GUIDE.md` for the full connection and first-admin bootstrap process.
Realtime setup and validation are documented in `REALTIME_GUIDE.md`.

The migration includes:

- `profiles`, `categories`, `products`, `orders`, `order_items`, `audit_logs`
- RLS on every public table
- admin-only writes for catalog and order management
- own-user access for orders and order items
- indexes for menu reads, order dashboards and audit queries
- constraints for prices, stock, quantities and statuses

## Monitoring

`src/lib/monitoring` defines a provider interface. Console monitoring is active by default. Sentry, PostHog and OpenTelemetry can be wired behind the same interface without changing UI code.

## Testing Strategy

- Unit/integration: Vitest + Testing Library
- End to end: Playwright
- CI: `.github/workflows/ci.yml`
- Target coverage: 80% statements/functions/lines, 70% branches

## Production Notes

Before enterprise production, run a staging deployment against a separate Supabase project and execute the E2E suite with real credentials. Keep RLS as the final authorization boundary even when server APIs are added.

Backup and disaster recovery procedures are documented in `BACKUP_RECOVERY_RUNBOOK.md`.
