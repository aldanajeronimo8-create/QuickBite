export type RuntimeMode = 'supabase';
export type AppEnvironment = 'development' | 'staging' | 'production';

export const appConfig = {
  appName: import.meta.env.VITE_APP_NAME ?? 'QuickBite',
  appEnv: (import.meta.env.VITE_APP_ENV ?? 'development') as AppEnvironment,
  publicAppUrl: import.meta.env.VITE_PUBLIC_APP_URL ?? '',
  runtimeMode: (import.meta.env.VITE_RUNTIME_MODE ?? 'supabase') as RuntimeMode,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  supabaseStorageBucket: import.meta.env.VITE_SUPABASE_STORAGE_BUCKET ?? '',
  supabaseRealtimeEnabled: import.meta.env.VITE_SUPABASE_REALTIME_ENABLED === 'true',
  dataRefreshIntervalMs: Number(import.meta.env.VITE_DATA_REFRESH_INTERVAL_MS ?? 5000),
  loyaltyRefreshIntervalMs: Math.max(
    15_000,
    Number(import.meta.env.VITE_LOYALTY_REFRESH_INTERVAL_MS ?? 15_000),
  ),
  passwordResetMode: import.meta.env.VITE_PASSWORD_RESET_MODE ?? 'code',
  monitoringDsn: import.meta.env.VITE_MONITORING_DSN ?? '',
  monitoringProvider: import.meta.env.VITE_MONITORING_PROVIDER ?? 'console',
  analyticsProvider: import.meta.env.VITE_ANALYTICS_PROVIDER ?? 'none',
  analyticsKey: import.meta.env.VITE_ANALYTICS_KEY ?? '',
  otelEndpoint: import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT ?? '',
  adminInviteCode: import.meta.env.VITE_ADMIN_INVITE_CODE ?? '',
  allowedOrigins: (import.meta.env.VITE_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  primaryDomain: import.meta.env.VITE_PRIMARY_DOMAIN ?? '',
  cdnUrl: import.meta.env.VITE_CDN_URL ?? '',
};

export function hasSupabaseConfig() {
  return Boolean(appConfig.supabaseUrl && appConfig.supabaseAnonKey);
}

export function needsFirstRunSetup() {
  if (import.meta.env.MODE === 'e2e') return true;
  return appConfig.runtimeMode === 'supabase' && !hasSupabaseConfig();
}
