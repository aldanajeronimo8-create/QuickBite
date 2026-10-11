# QuickBite — migraciones divergentes entre la base remota y el repositorio

Fecha: 2026-10-10  
Origen: proyecto Supabase `cczbbqxunygcowqfrqdm`  
Repositorio: `aldanajeronimo8-create/QuickBite`, rama `main`

## Resumen

- Versiones registradas en la base remota: 207
- Archivos SQL en `supabase/migrations` del repositorio: 158
- Nombres semánticos presentes en ambos lados: 130
- Migraciones registradas remotamente cuyo nombre no aparece en el repo: 77
- Archivos del repo cuyo nombre no aparece entre las migraciones remotas: 25

**Advertencia:** el nombre parecido no prueba que el SQL sea equivalente. Los timestamps de migración también difieren. No usar `db push` ni aplicar todo el directorio a producción para resolver esta discrepancia. Para la nueva base, comparar el SQL real de cada migración ausente con las funciones, tablas, políticas y triggers actuales; después generar una línea base reproducible y probada.

## Registradas en remoto, nombre no encontrado en el repositorio
- `20260829154250_add_historical_reports`
- `20260829193054_platform_features_20260829`
- `20260829202145_automatic_stock_and_demand`
- `20260829203159_automatic_daily_summary`
- `20260829203609_sync_staff_roles_from_profile_roles`
- `20260829233519_restore_student_order_scheduling_rpc`
- `20260829235128_clear_exported_redemptions_admin_only`
- `20260830000313_admin_delete_exported_redemptions_rpc`
- `20260830001317_fix_payment_verification_flow_and_breb`
- `20260830002901_restore_pickup_breaks_and_automation`
- `20260830005411_fix_pickup_timezone_and_past_slot`
- `20260830005421_fix_pickup_local_date_boundary`
- `20260830200949_harden_order_state_machine_20260830`
- `20260831141905_add_optional_school_commerce_features`
- `20260831154055_wallet_topups_and_student_links`
- `20260831154228_student_link_code_and_wallet_notifications`
- `20260831195749_add_system_operational_activity_timestamps`
- `20260831213653_add_parent_role_and_secure_family_link_codes`
- `20260831213818_add_parent_registration_and_link_rpc`
- `20260831214644_fix_student_family_pairing_code`
- `20260831214727_make_family_pairing_codes_one_time_and_reusable`
- `20260831222125_fix_student_link_code_rpc_contract`
- `20260831223201_fix_student_link_code_without_pgcrypto`
- `20260831225547_fix_admin_user_deletion_and_cleanup_orphan_profiles`
- `20260831230830_remove_ambiguous_student_consent_rpc_overload`
- `20260831231204_enforce_parent_registration_code_and_complete_link`
- `20260831231432_limit_family_link_counts`
- `20260831231853_add_secure_order_qr_verification`
- `20260831234403_parent_student_acting_context`
- `20260831234610_harden_parent_student_context`
- `20260831234705_complete_parent_student_rpc_context`
- `20260831235630_add_parent_student_impersonation_and_comment_sync_v2`
- `20260831235806_sync_student_comments_and_parent_context`
- `20260901011040_add_wallet_credit_checkout`
- `20260901012329_enable_wallet_credit_orders_v2`
- `20260901022329_separate_operational_order_reset_and_payment_rejection`
- `20260901025643_fix_student_code_order_and_reset_authorization`
- `20260901025700_repair_create_order_tx_after_trigger_hardening`
- `20260901030254_allow_all_users_wallet_topups_and_remove_ambiguous_overload`
- `20260901031007_preserve_financial_history_on_reset`
- `20260901032300_fix_complete_operational_reset_v3`
- `20260901034733_fix_notification_read_function_overload`
- `20260901041122_fix_full_reset_delete_where_and_period_cleanup`
- `20260901180219_fix_admin_role_and_loyalty_visibility`
- `20260901180401_normalize_admin_visibility_flags`
- `20260901191522_fix_admin_wallet_topup_listing`
- `20260901191549_allow_administrator_wallet_topup_review`
- `20260901212208_repair_loyalty_reward_visibility`
- `20260902200533_add_product_cancellation_requests_v2`
- `20260902231346_partial_product_cancellation_quantities`
- `20260903043639_enable_leaked_password_protection`
- `20260903043653_remove_explicit_hibp_probe_migration`
- `20260903043805_phase2_sync_anon_function_least_privilege_final`
- `20260903043858_phase2_sync_anon_function_least_privilege_final_2`
- `20260903131258_fix_postgrest_rate_limit_hook_api_roles`
- `20260903131955_restore_admin_test_period_reset_access`
- `20260903141939_fix_data_api_rate_limit_read_rpc_transactions`
- `20260903144744_allow_linked_parent_view_student_consent`
- `20260903153358_harden_wallet_topup_admin_review_result`
- `20260903153749_fix_wallet_topup_notification_type`
- `20260903172035_fix_order_visibility_admin_views_20260903`
- `20260903172449_fix_admin_order_visibility_authorization_20260903`
- `20260903173627_repair_auth_token_nulls_20260903`
- `20260903173746_harden_admin_order_status_notifications_20260903`
- `20260903173949_repair_auth_email_change_null_20260903`
- `20260904163754_complete_revoke_public_wallet_approval_rpc`
- `20260905191954_admin_managed_account_roles_and_crud_20260905`
- `20260905191959_allow_student_parent_to_generate_codes_20260905`
- `20260905201846_add_visual_interface_overrides`
- `20260906015512_repair_auth_internal_string_nulls_20260906`
- `20260906190854_add_user_theme_preferences`
- `20260913234837_fix_parent_family_dashboard_phase5_tables`
- `20260914025351_grant_is_admin_execute_to_anon`
- `20260914043649_harden_create_order_tx_inputs_20260914`
- `20260914051653_support_system_theme_and_drop_visual_settings`
- `20260917165915_login_email_existence_check`
- `20261010040554_allow_admins_to_create_staff_accounts`

## Archivos del repositorio cuyo nombre no aparece en el historial remoto
- `20260830000000_harden_order_state_machine.sql`
- `20260830000003_rejected_order_notification.sql`
- `20260830110000_lock_order_state_transitions.sql`
- `20260831000000_parent_accounts_and_family_linking.sql`
- `20260831000000_wallet_credit_checkout.sql`
- `20260831000001_fix_admin_delete_user.sql`
- `20260831_system_operational_snapshot_activity.sql`
- `20260901000000_operational_order_visibility_and_reset.sql`
- `20260901000003_consolidate_wallet_topup_rpc.sql`
- `20260902180000_product_cancellation_requests.sql`
- `20260902181300_product_cancellation_partial_quantity.sql`
- `20260902184000_protect_e2e_verification_account.sql`
- `20260903180000_fix_admin_order_visibility_authorization.sql`
- `20260903181000_repair_auth_token_nulls.sql`
- `20260903181500_harden_admin_order_status_notifications.sql`
- `20260903182000_repair_auth_email_change_null.sql`
- `20260905143000_admin_managed_account_roles_and_crud.sql`
- `20260905150000_allow_student_parent_to_generate_student_codes.sql`
- `20260905210000_visual_element_overrides.sql`
- `20260906000000_repair_auth_internal_string_nulls.sql`
- `20260906120000_user_theme_preferences.sql`
- `20260906133000_allow_system_theme_preference.sql`
- `20260913220000_sync_is_admin_execute.sql`
- `20260925130500_fix_create_order_tx_pgcrypto_search_path.sql`
- `20261010220000_prevent_orphan_admin_notification_fanout.sql`

## Próximo paso
Revisar el SQL de los archivos relevantes, comparar el esquema efectivo y clasificar cada diferencia como renombrado/re-timestamp, cambio incluido en otra migración, cambio solo remoto o cambio solo en el repo. No asumir que las 77 diferencias remotas son cambios funcionales únicos ni descartar las 25 del repositorio sin inspección.
