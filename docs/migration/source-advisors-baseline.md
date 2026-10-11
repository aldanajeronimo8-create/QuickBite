# QuickBite — baseline de advisories Supabase

Fecha: 2026-10-10. Solo diagnóstico; no se han cambiado permisos ni índices.

## Seguridad
- INFO — RLS Enabled No Policy (`rls_enabled_no_policy`): 4 hallazgos. https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- WARN — Public Can See Object in GraphQL Schema (`pg_graphql_anon_table_exposed`): 20 hallazgos. https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed
- WARN — Signed-In Users Can See Object in GraphQL Schema (`pg_graphql_authenticated_table_exposed`): 52 hallazgos. https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed
- WARN — Public Can Execute SECURITY DEFINER Function (`anon_security_definer_function_executable`): 16 hallazgos. https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- WARN — Signed-In Users Can Execute SECURITY DEFINER Function (`authenticated_security_definer_function_executable`): 117 hallazgos. https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- WARN — Leaked Password Protection Disabled (`auth_leaked_password_protection`): 1 hallazgos. https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Rendimiento
- INFO — Unindexed foreign keys (`unindexed_foreign_keys`): 17 hallazgos. https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- WARN — Auth RLS Initialization Plan (`auth_rls_initplan`): 38 hallazgos. https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
- INFO — No Primary Key (`no_primary_key`): 1 hallazgos. https://supabase.com/docs/guides/database/database-linter?lint=0004_no_primary_key
- INFO — Unused Index (`unused_index`): 29 hallazgos. https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index
- WARN — Multiple Permissive Policies (`multiple_permissive_policies`): 69 hallazgos. https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies
- WARN — Duplicate Index (`duplicate_index`): 4 hallazgos. https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index

## Cómo usar esta lista
Estos avisos son puntos de revisión, no autorización para aplicar cambios masivos. En la base nueva, revisar caso por caso: privilegios de GraphQL/Data API, políticas RLS reales por rol, funciones privilegiadas, índices faltantes solo cuando ayuden a consultas reales y patrones de RLS que evalúan auth por fila. No revocar permisos en bloque sin validar los flujos de la app.