import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { hasSupabaseConfig } from '../../config/appConfig';
import { requireSupabaseClient } from '../../lib/supabase';
import { loadVisualSettings } from '../../services/visualSettingsService';
import { DEFAULT_VISUAL_SETTINGS, getVisualCssVariables, resolveVisualSettings, sanitizeVisualSettings, type VisualInterfaceScope, type VisualSettings, type VisualSettingsDraft } from '../../types/visualSettings';

type VisualThemeContextValue = { settings: VisualSettings; loading: boolean; error: string | null; refresh: () => Promise<void>; applyLocal: (draft: VisualSettingsDraft) => void; };
const VisualThemeContext = createContext<VisualThemeContextValue | null>(null);
const VALID_SCOPES: VisualInterfaceScope[] = ['login_student','login_parent','login_admin','admin','student','parent'];
const PRODUCTION_SIDEBAR = { sidebar: '#1747B8', foreground: '#FFFFFF', primary: '#2563EB', primaryForeground: '#FFFFFF', accent: 'rgba(255,255,255,0.12)', accentForeground: '#FFFFFF', border: 'rgba(255,255,255,0.12)', ring: '#E0ECFF' };
const PREVIEW_STORAGE_KEY = 'quickbite_visual_preview_settings';

function getPathScope(pathname: string, search: string): VisualInterfaceScope | null {
  const params = new URLSearchParams(search);
  const previewRole = params.get('preview_role');
  if ((pathname === '/' || pathname === '/login') && (previewRole === 'student' || previewRole === 'parent' || previewRole === 'admin')) return `login_${previewRole}` as VisualInterfaceScope;
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/parent')) return 'parent';
  if (pathname.startsWith('/menu') || pathname.startsWith('/student')) return 'student';
  return null;
}

export function getVisualPreviewScope(): VisualInterfaceScope | null {
  if (typeof window === 'undefined') return null;
  const direct = getPathScope(window.location.pathname, window.location.search);
  if (direct) return direct;
  try {
    if (window.top !== window.self && window.parent.location.pathname.startsWith('/admin/appearance')) return getPathScope(window.location.pathname, window.location.search);
  } catch { return null; }
  return null;
}

export function isVisualPreviewMode(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('visual_preview') === '1' && Boolean(getVisualPreviewScope())) return true;
  try { return window.top !== window.self && window.parent.location.pathname.startsWith('/admin/appearance') && Boolean(getVisualPreviewScope()); }
  catch { return false; }
}

export function getVisualInterfaceScope(): VisualInterfaceScope {
  const previewScope = getVisualPreviewScope();
  if (previewScope && (isVisualPreviewMode() || new URLSearchParams(window.location.search).has('visual_preview_scope'))) return previewScope;
  if (typeof document !== 'undefined') {
    const explicit = document.querySelector<HTMLElement>('[data-qb-interface]')?.dataset.qbInterface;
    if (explicit && VALID_SCOPES.includes(explicit as VisualInterfaceScope)) return explicit as VisualInterfaceScope;
    const auth = document.querySelector<HTMLElement>('.qb-auth');
    if (auth?.classList.contains('qb-auth--admin')) return 'login_admin';
    if (Array.from(document.querySelectorAll('h3')).some(node => /iniciar sesión como padre/i.test(node.textContent ?? ''))) return 'login_parent';
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

function applyDocumentTheme(settings: VisualSettingsDraft, scope: VisualInterfaceScope, active: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  Object.entries(getVisualCssVariables(settings)).forEach(([name, value]) => root.style.setProperty(name, value));

  // Keep only the administrative shell/sidebar locked to production.
  // The main Admin interface must still receive the saved guided override.
  root.style.setProperty('--sidebar', PRODUCTION_SIDEBAR.sidebar);
  root.style.setProperty('--sidebar-foreground', PRODUCTION_SIDEBAR.foreground);
  root.style.setProperty('--sidebar-primary', PRODUCTION_SIDEBAR.primary);
  root.style.setProperty('--sidebar-primary-foreground', PRODUCTION_SIDEBAR.primaryForeground);
  root.style.setProperty('--sidebar-accent', PRODUCTION_SIDEBAR.accent);
  root.style.setProperty('--sidebar-accent-foreground', PRODUCTION_SIDEBAR.accentForeground);
  root.style.setProperty('--sidebar-border', PRODUCTION_SIDEBAR.border);
  root.style.setProperty('--sidebar-ring', PRODUCTION_SIDEBAR.ring);

  root.style.setProperty('--qb-header-style', settings.header_style);
  root.style.setProperty('--qb-navigation-style', settings.navigation_style);
  root.style.setProperty('--qb-card-style', settings.card_style);
  root.style.setProperty('--qb-input-style', settings.input_style);
  root.dataset.qbTheme = settings.theme_mode;
  root.dataset.qbButtonStyle = settings.button_style;
  root.dataset.qbCardStyle = settings.card_style;
  root.dataset.qbInputStyle = settings.input_style;
  root.dataset.qbHeaderStyle = settings.header_style;
  root.dataset.qbNavigationStyle = settings.navigation_style;
  root.dataset.qbVisualPreview = isVisualPreviewMode() ? '1' : '0';
  root.dataset.qbVisualPreviewScope = scope;
  root.dataset.qbVisualActive = active ? '1' : '0';
  root.classList.toggle('dark', settings.theme_mode === 'dark');
  document.title = settings.app_name;
  let link = document.querySelector<HTMLLinkElement>('link[data-quickbite-favicon]');
  if (!link) { link = document.createElement('link'); link.rel = 'icon'; link.dataset.quickbiteFavicon = 'true'; document.head.appendChild(link); }
  link.href = settings.favicon_url || '/favicon.ico';
}

function readStoredPreview(): VisualSettingsDraft | null {
  if (typeof window === 'undefined' || !isVisualPreviewMode()) return null;
  try {
    const raw = window.localStorage.getItem(PREVIEW_STORAGE_KEY);
    return raw ? sanitizeVisualSettings(JSON.parse(raw) as Partial<VisualSettingsDraft>) : null;
  } catch { return null; }
}

function toStoredSettings(draft: VisualSettingsDraft, previous: VisualSettings): VisualSettings { return { ...draft, id: true, updated_at: previous.updated_at, updated_by: previous.updated_by }; }

export function VisualThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<VisualSettings>({ ...DEFAULT_VISUAL_SETTINGS, id: true, updated_at: new Date(0).toISOString(), updated_by: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<VisualSettingsDraft | null>(readStoredPreview);
  const [scope, setScope] = useState<VisualInterfaceScope>(getVisualInterfaceScope);

  const refresh = useCallback(async () => {
    if (!hasSupabaseConfig() || isVisualPreviewMode()) return;
    setLoading(true);
    try { const next = await loadVisualSettings(); setSettings(next); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cargar la configuración visual.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => setScope(getVisualInterfaceScope());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'data-qb-interface'] });
    return () => observer.disconnect();
  }, []);

  const effectiveSettings = useMemo(() => {
    // Preview always wins. Otherwise the selected interface resolves its own
    // scoped override over the global production configuration.
    if (preview) return preview;
    return resolveVisualSettings(settings, scope);
  }, [preview, settings, scope]);

  useEffect(() => {
    const storedOverride = settings.interface_overrides?.[scope];
    const active = Boolean(preview) || isVisualPreviewMode() || Boolean(storedOverride && Object.keys(storedOverride).length);
    applyDocumentTheme(effectiveSettings, scope, active);
  }, [effectiveSettings, preview, scope, settings.interface_overrides]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !event.data) return;
      if (event.data.type === 'quickbite-visual-preview' && event.data.settings && typeof event.data.settings === 'object') {
        setPreview(sanitizeVisualSettings(event.data.settings as Partial<VisualSettingsDraft>));
      } else if (event.data.type === 'quickbite-visual-preview-clear') setPreview(null);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== PREVIEW_STORAGE_KEY) return;
      try { setPreview(event.newValue ? sanitizeVisualSettings(JSON.parse(event.newValue) as Partial<VisualSettingsDraft>) : null); }
      catch { setPreview(null); }
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener('message', onMessage); window.removeEventListener('storage', onStorage); };
  }, []);

  // The guided editor opens the real application in a separate window.
  // Signal readiness so the editor can immediately push the current draft.
  useEffect(() => {
    if (typeof window === 'undefined' || !isVisualPreviewMode() || !window.opener) return;
    try {
      window.opener.postMessage({ type: 'quickbite-visual-preview-ready' }, window.location.origin);
    } catch { /* popup may deny cross-window messaging */ }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || settings.theme_mode !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => { if (!preview) document.documentElement.classList.toggle('dark', media.matches); };
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, [preview, settings.theme_mode]);

  useEffect(() => {
    if (!hasSupabaseConfig() || isVisualPreviewMode()) return;
    try {
      const client = requireSupabaseClient();
      const channel = client.channel('quickbite-visual-settings').on('postgres_changes', { event: '*', schema: 'public', table: 'app_visual_settings' }, payload => {
        if (payload.new && typeof payload.new === 'object') void loadVisualSettings(client).then(setSettings).catch(() => undefined);
      }).subscribe();
      return () => { void channel.unsubscribe(); };
    } catch { return undefined; }
  }, []);

  const applyLocal = useCallback((draft: VisualSettingsDraft) => setSettings(previous => toStoredSettings(draft, previous)), []);
  const value = useMemo(() => ({ settings, loading, error, refresh, applyLocal }), [applyLocal, error, loading, refresh, settings]);
  return <VisualThemeContext.Provider value={value}>{children}</VisualThemeContext.Provider>;
}

export function useVisualTheme(): VisualThemeContextValue {
  const context = useContext(VisualThemeContext);
  if (!context) throw new Error('useVisualTheme debe utilizarse dentro de VisualThemeProvider.');
  return context;
}
