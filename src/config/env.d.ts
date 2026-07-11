interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_ENV?: 'development' | 'staging' | 'production';
  readonly VITE_PUBLIC_APP_URL?: string;
  readonly VITE_RUNTIME_MODE?: 'supabase';
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_STORAGE_BUCKET?: string;
  readonly VITE_SUPABASE_REALTIME_ENABLED?: string;
  readonly VITE_DATA_REFRESH_INTERVAL_MS?: string;
  readonly VITE_LOYALTY_REFRESH_INTERVAL_MS?: string;
  readonly VITE_PASSWORD_RESET_MODE?: 'code' | 'email';
  readonly VITE_ADMIN_INVITE_CODE?: string;
  readonly VITE_ALLOWED_ORIGINS?: string;
  readonly VITE_MONITORING_PROVIDER?: string;
  readonly VITE_MONITORING_DSN?: string;
  readonly VITE_ANALYTICS_PROVIDER?: string;
  readonly VITE_ANALYTICS_KEY?: string;
  readonly VITE_OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  readonly VITE_PRIMARY_DOMAIN?: string;
  readonly VITE_CDN_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
