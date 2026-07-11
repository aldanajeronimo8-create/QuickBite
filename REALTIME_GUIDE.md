# Realtime Guide

QuickBite uses Supabase Realtime Postgres Changes when:

```bash
VITE_RUNTIME_MODE=supabase
VITE_SUPABASE_REALTIME_ENABLED=true
```

## How It Works

- The migration adds `categories`, `products`, `orders` and `order_items` to the `supabase_realtime` publication.
- `useDataStore.subscribeRealtime()` opens one channel named `quickbite-db-changes`.
- Any insert, update or delete on those tables schedules a debounced `loadData()`.
- The UI receives fresh Zustand state, so users see updates without refreshing the page.

## What Updates Live

- Menu category/product changes.
- Stock changes.
- New orders.
- Order status changes.
- Payment status changes.
- Order item changes.

## Production Notes

- Keep RLS enabled. Realtime should mirror what the user is allowed to read.
- Use separate Supabase projects for staging and production.
- If updates do not arrive, check Database > Publications > `supabase_realtime` and confirm the four tables are enabled.
