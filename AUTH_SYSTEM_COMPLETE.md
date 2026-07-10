# QuickBite Authentication

Production authentication must use Supabase Auth or a server-side provider. This repository does not include fixed passwords, fixed verification codes, project URLs, anon keys or service-role keys.

Local mode exists only for demos and stores salted password hashes in browser storage. Do not use local mode for production.

Required production controls:

- Supabase Auth enabled.
- `profiles.role` checked by RLS and route guards.
- First admin created through a protected server-side bootstrap flow.
- Service-role keys restricted to server functions or CI.
- Password reset and email confirmation configured in the auth provider.
