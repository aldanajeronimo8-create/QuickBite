# Troubleshooting: Failed to Fetch

Check:

- `.env` exists and was created from `.env.example`.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` belong to your own Supabase project.
- The browser origin is included in `VITE_ALLOWED_ORIGINS` and server-side `ALLOWED_ORIGINS`.
- Supabase Auth URL settings include your app domain.
- RLS policies were applied from `supabase/migrations/20260609000000_initial.sql`.

No project-specific URL or verification code is required by this repository.
