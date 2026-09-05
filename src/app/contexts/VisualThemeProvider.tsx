import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { hasSupabaseConfig } from '../../config/appConfig';
import { requireSupabaseClient } from '../../lib/supabase';
import { loadVisualSettings } from '../../services/visualSettingsService';
import { DEFAULT_VISUAL_SETTINGS, getVisualCssVariables, type VisualSettings, type VisualSettingsDraft } from '../../types/visualSettings';

type VisualThemeContextValue = {
  settings: VisualSettings;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  applyLocal: (draft: VisualSettingsDraft) => void;
};

const VisualThemeContext = createContext<VisualThemeContextValue | null>(null);

function applyDocumentTheme(settings: VisualSettings) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const variables = getVisualCssVariables(settings);
  Object.entries(variables).forEach(([name, value]) => root.style.setProperty(name, value));
  root.style.setProperty('--qb-header-style', settings.header_style);
  root.style.setProperty('--qb-navigation-style', settings.navigation_style);
  root.style.setProperty('--qb-card-style', settings.card_style);
  root.style.setProperty('--qb-input-style', settings.input_style);
  root.classList.toggle('dark', settings.theme_mode === 'dark');
  root.dataset.qbTheme = settings.theme_mode;
  document.title = settings.app_name;

  const favicon = settings.favicon_url;
  let link = document.querySelector<HTMLLinkElement>('link[data-quickbite-favicon]');
  if (!favicon) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.dataset.quickbiteFavicon = 'true';
    document.head.appendChild(link);
  }
  link.href = favicon || '/favicon.ico';
}

function toStoredSettings(draft: VisualSettingsDraft, previous: VisualSettings): VisualSettings {
  return { ...draft, id: true, updated_at: previous.updated_at, updated_by: previous.updated_by };
}

export function VisualThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<VisualSettings>(() => ({ ...DEFAULT_VISUAL_SETTINGS, id: true, updated_at: new Date(0).toISOString(), updated_by: null }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!hasSupabaseConfig()) return;
    setLoading(true);
    try {
      const next = await loadVisualSettings();
      setSettings(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la configuración visual.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { applyDocumentTheme(settings); }, [settings]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (settings.theme_mode !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => document.documentElement.classList.toggle('dark', media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, [settings.theme_mode]);

  useEffect(() => {
    if (!hasSupabaseConfig()) return;
    let channel: ReturnType<ReturnType<typeof requireSupabaseClient>['channel']> | null = null;
    try {
      const client = requireSupabaseClient();
      channel = client.channel('quickbite-visual-settings').on('postgres_changes', { event: '*', schema: 'public', table: 'app_visual_settings' }, (payload) => {
        if (payload.new && typeof payload.new === 'object') {
          void loadVisualSettings(client).then(setSettings).catch(() => undefined);
        }
      }).subscribe();
    } catch {
      channel = null;
    }
    return () => { if (channel) void channel.unsubscribe(); };
  }, []);

  const applyLocal = useCallback((draft: VisualSettingsDraft) => setSettings((previous) => toStoredSettings(draft, previous)), []);
  const value = useMemo(() => ({ settings, loading, error, refresh, applyLocal }), [applyLocal, error, loading, refresh, settings]);
  return <VisualThemeContext.Provider value={value}>{children}</VisualThemeContext.Provider>;
}

export function useVisualTheme(): VisualThemeContextValue {
  const context = useContext(VisualThemeContext);
  if (!context) throw new Error('useVisualTheme debe utilizarse dentro de VisualThemeProvider.');
  return context;
}
