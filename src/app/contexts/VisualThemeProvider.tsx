import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { hasSupabaseConfig } from '../../config/appConfig';
import { requireSupabaseClient } from '../../lib/supabase';
import { loadVisualSettings } from '../../services/visualSettingsService';
import { DEFAULT_VISUAL_SETTINGS, getVisualCssVariables, resolveVisualSettings, type VisualInterfaceScope, type VisualSettings, type VisualSettingsDraft } from '../../types/visualSettings';

type VisualThemeContextValue = { settings: VisualSettings; loading: boolean; error: string | null; refresh: () => Promise<void>; applyLocal: (draft: VisualSettingsDraft) => void; };
const VisualThemeContext = createContext<VisualThemeContextValue | null>(null);

export function getVisualInterfaceScope(): VisualInterfaceScope {
  if (typeof document !== 'undefined') {
    const explicit = document.querySelector<HTMLElement>('[data-qb-interface]')?.dataset.qbInterface;
    if (explicit && ['login_student','login_parent','login_admin','admin','student','parent'].includes(explicit)) return explicit as VisualInterfaceScope;
  }
  if (typeof window !== 'undefined') {
    const path = window.location.pathname;
    if (path === '/' || path === '/login') return 'login_student';
    if (path.startsWith('/admin')) return 'admin';
    if (path.startsWith('/parent')) return 'parent';
    if (path.startsWith('/menu') || path.startsWith('/student')) return 'student';
  }
  return 'student';
}

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
  let link = document.querySelector<HTMLLinkElement>('link[data-quickbite-favicon]');
  if (!link) { link = document.createElement('link'); link.rel = 'icon'; link.dataset.quickbiteFavicon = 'true'; document.head.appendChild(link); }
  link.href = settings.favicon_url || '/favicon.ico';
}

function toStoredSettings(draft: VisualSettingsDraft, previous: VisualSettings): VisualSettings { return { ...draft, id: true, updated_at: previous.updated_at, updated_by: previous.updated_by }; }

export function VisualThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<VisualSettings>(() => ({ ...DEFAULT_VISUAL_SETTINGS, id: true, updated_at: new Date(0).toISOString(), updated_by: null }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<VisualSettingsDraft | null>(null);

  const refresh = useCallback(async () => {
    if (!hasSupabaseConfig()) return;
    setLoading(true);
    try { const next = await loadVisualSettings(); setSettings(next); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cargar la configuración visual.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const effectiveSettings = useMemo(() => preview ?? resolveVisualSettings(settings, getVisualInterfaceScope()), [preview, settings]);
  useEffect(() => { applyDocumentTheme(effectiveSettings); }, [effectiveSettings]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !event.data || event.data.type !== 'quickbite-visual-preview') return;
      if (event.data.settings && typeof event.data.settings === 'object') setPreview(event.data.settings as VisualSettingsDraft);
      if (event.data.type === 'quickbite-visual-preview-clear') setPreview(null);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || settings.theme_mode !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => { if (!preview) document.documentElement.classList.toggle('dark', media.matches); };
    sync(); media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, [preview, settings.theme_mode]);

  useEffect(() => {
    if (!hasSupabaseConfig()) return;
    try {
      const client = requireSupabaseClient();
      const channel = client.channel('quickbite-visual-settings').on('postgres_changes', { event: '*', schema: 'public', table: 'app_visual_settings' }, (payload) => {
        if (payload.new && typeof payload.new === 'object') void loadVisualSettings(client).then(setSettings).catch(() => undefined);
      }).subscribe();
      return () => { void channel.unsubscribe(); };
    } catch { return undefined; }
  }, []);

  const applyLocal = useCallback((draft: VisualSettingsDraft) => setSettings((previous) => toStoredSettings(draft, previous)), []);
  const value = useMemo(() => ({ settings, loading, error, refresh, applyLocal }), [applyLocal, error, loading, refresh, settings]);
  return <VisualThemeContext.Provider value={value}>{children}</VisualThemeContext.Provider>;
}

export function useVisualTheme(): VisualThemeContextValue { const context = useContext(VisualThemeContext); if (!context) throw new Error('useVisualTheme debe utilizarse dentro de VisualThemeProvider.'); return context; }
