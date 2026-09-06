import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { hasSupabaseConfig } from '../../config/appConfig';
import { requireSupabaseClient } from '../../lib/supabase';
import { loadVisualSettings } from '../../services/visualSettingsService';
import {
  DEFAULT_VISUAL_SETTINGS,
  getVisualCssVariables,
  resolveVisualSettings,
  sanitizeVisualElementStyle,
  sanitizeVisualSettings,
  type VisualElementStyle,
  type VisualInterfaceScope,
  type VisualSettings,
  type VisualSettingsDraft,
} from '../../types/visualSettings';

type VisualThemeContextValue = {
  settings: VisualSettings;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  applyLocal: (draft: VisualSettingsDraft) => void;
};

const VisualThemeContext = createContext<VisualThemeContextValue | null>(null);
const VALID_SCOPES: VisualInterfaceScope[] = ['login_student', 'login_parent', 'login_admin', 'admin', 'student', 'parent'];
const PRODUCTION_SIDEBAR = { sidebar: '#1747B8', foreground: '#FFFFFF', primary: '#2563EB', primaryForeground: '#FFFFFF', accent: 'rgba(255,255,255,0.12)', accentForeground: '#FFFFFF', border: 'rgba(255,255,255,0.12)', ring: '#E0ECFF' };
const PREVIEW_STORAGE_KEY = 'quickbite_visual_preview_settings';
const ROOT_SELECTOR = ':root';
const originalTextNodes = new WeakMap<HTMLElement, Map<Text, string>>();

type ResolvedThemeMode = 'light' | 'dark';

function resolveThemeMode(mode: VisualSettingsDraft['theme_mode']): ResolvedThemeMode {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applySemanticThemeTokens(root: HTMLElement, mode: ResolvedThemeMode, settings: VisualSettingsDraft) {
  const light = {
    background: '#F5F8F7',
    surface: '#FFFFFF',
    surfaceMuted: '#F1F5F9',
    surfaceElevated: '#FFFFFF',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#64748B',
    border: 'rgba(15,23,42,.10)',
    accentSoft: 'rgba(0,184,107,.10)',
    shadow: '0 12px 32px rgba(15,23,42,.08)',
  };
  const dark = {
    background: '#070D19',
    surface: '#0D1628',
    surfaceMuted: '#111C30',
    surfaceElevated: '#16243A',
    textPrimary: '#F5F7FA',
    textSecondary: '#AAB7C9',
    textMuted: '#718096',
    border: 'rgba(148,163,184,.16)',
    accentSoft: 'rgba(0,184,107,.14)',
    shadow: '0 18px 44px rgba(0,0,0,.28)',
  };
  const palette = mode === 'dark' ? dark : light;
  const accent = '#00B86B';

  root.dataset.qbTheme = mode;
  root.dataset.qbResolvedTheme = mode;
  root.style.colorScheme = mode;

  const tokens: Record<string, string> = {
    '--qb-theme-bg': palette.background,
    '--qb-theme-surface': palette.surface,
    '--qb-theme-surface-2': palette.surfaceMuted,
    '--qb-theme-surface-3': palette.surfaceElevated,
    '--qb-theme-text': palette.textPrimary,
    '--qb-theme-text-secondary': palette.textSecondary,
    '--qb-theme-text-muted': palette.textMuted,
    '--qb-theme-border': palette.border,
    '--qb-theme-accent': accent,
    '--qb-theme-accent-soft': palette.accentSoft,
    '--qb-theme-shadow': palette.shadow,
    '--background': palette.background,
    '--foreground': palette.textPrimary,
    '--card': palette.surface,
    '--card-foreground': palette.textPrimary,
    '--popover': palette.surfaceElevated,
    '--popover-foreground': palette.textPrimary,
    '--primary': accent,
    '--primary-foreground': '#FFFFFF',
    '--secondary': palette.surfaceMuted,
    '--secondary-foreground': palette.textPrimary,
    '--muted': palette.surfaceMuted,
    '--muted-foreground': palette.textSecondary,
    '--accent': palette.surfaceMuted,
    '--accent-foreground': palette.textPrimary,
    '--border': palette.border,
    '--input': palette.surfaceMuted,
    '--ring': accent,
    '--qb-primary': accent,
    '--qb-secondary': mode === 'dark' ? '#16243A' : '#EAF0F7',
    '--qb-accent': '#14B8A6',
    '--qb-background': palette.background,
    '--qb-surface': palette.surface,
    '--qb-text': palette.textPrimary,
    '--qb-text-secondary': palette.textSecondary,
    '--qb-text-muted': palette.textMuted,
    '--qb-border': palette.border,
    '--qb-success': '#00B86B',
    '--qb-warning': '#F59E0B',
    '--qb-error': '#EF4444',
    '--qb-accent-soft': palette.accentSoft,
    '--qb-shadow': palette.shadow,
    '--sidebar': mode === 'dark' ? '#0B1424' : PRODUCTION_SIDEBAR.sidebar,
    '--sidebar-foreground': '#FFFFFF',
    '--sidebar-primary': mode === 'dark' ? accent : PRODUCTION_SIDEBAR.primary,
    '--sidebar-primary-foreground': '#FFFFFF',
    '--sidebar-accent': mode === 'dark' ? 'rgba(148,163,184,.12)' : PRODUCTION_SIDEBAR.accent,
    '--sidebar-accent-foreground': '#FFFFFF',
    '--sidebar-border': mode === 'dark' ? 'rgba(148,163,184,.12)' : PRODUCTION_SIDEBAR.border,
    '--sidebar-ring': mode === 'dark' ? accent : PRODUCTION_SIDEBAR.ring,
  };
  Object.entries(tokens).forEach(([name, value]) => root.style.setProperty(name, value));

  // Keep the administrator's configurable brand color available for explicitly branded controls,
  // while the global surfaces remain semantic and appearance-aware.
  root.style.setProperty('--qb-configured-primary', settings.primary_color);
}

function getPathScope(pathname: string, search: string): VisualInterfaceScope | null {
  const params = new URLSearchParams(search);
  const previewRole = params.get('preview_role');
  if ((pathname === '/' || pathname === '/login') && (previewRole === 'student' || previewRole === 'parent' || previewRole === 'admin')) {
    return `login_${previewRole}` as VisualInterfaceScope;
  }
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
    if (window.top !== window.self && window.parent.location.pathname.startsWith('/admin/appearance')) {
      return getPathScope(window.location.pathname, window.location.search);
    }
  } catch {
    return null;
  }
  return null;
}

export function isVisualPreviewMode(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('visual_preview') === '1' && Boolean(getVisualPreviewScope())) return true;
  try {
    return window.top !== window.self && window.parent.location.pathname.startsWith('/admin/appearance') && Boolean(getVisualPreviewScope());
  } catch {
    return false;
  }
}

export function getVisualInterfaceScope(): VisualInterfaceScope {
  const previewScope = getVisualPreviewScope();
  if (previewScope && (isVisualPreviewMode() || new URLSearchParams(window.location.search).has('visual_preview_scope'))) return previewScope;
  if (typeof document !== 'undefined') {
    const explicit = document.querySelector<HTMLElement>('[data-qb-interface]')?.dataset.qbInterface;
    if (explicit && VALID_SCOPES.includes(explicit as VisualInterfaceScope)) return explicit as VisualInterfaceScope;
    const auth = document.querySelector<HTMLElement>('.qb-auth');
    if (auth?.classList.contains('qb-auth--admin')) return 'login_admin';
    if (Array.from(document.querySelectorAll('h3')).some((node) => /iniciar sesión como padre/i.test(node.textContent ?? ''))) return 'login_parent';
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
  const resolvedMode = resolveThemeMode(settings.theme_mode);
  Object.entries(getVisualCssVariables(settings)).forEach(([name, value]) => root.style.setProperty(name, value));
  applySemanticThemeTokens(root, resolvedMode, settings);
  root.style.setProperty('--qb-header-style', settings.header_style);
  root.style.setProperty('--qb-navigation-style', settings.navigation_style);
  root.style.setProperty('--qb-card-style', settings.card_style);
  root.style.setProperty('--qb-input-style', settings.input_style);
  root.dataset.qbButtonStyle = settings.button_style;
  root.dataset.qbCardStyle = settings.card_style;
  root.dataset.qbInputStyle = settings.input_style;
  root.dataset.qbHeaderStyle = settings.header_style;
  root.dataset.qbNavigationStyle = settings.navigation_style;
  root.dataset.qbVisualPreview = isVisualPreviewMode() ? '1' : '0';
  root.dataset.qbVisualPreviewScope = scope;
  root.dataset.qbVisualActive = active ? '1' : '0';
  document.title = settings.app_name;
  let link = document.querySelector<HTMLLinkElement>('link[data-quickbite-favicon]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.dataset.quickbiteFavicon = 'true';
    document.head.appendChild(link);
  }
  link.href = settings.favicon_url || '/favicon.ico';
}

function replaceDirectText(element: HTMLElement, value: string) {
  const nodes = Array.from(element.childNodes).filter((node): node is Text => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()));
  if (nodes.length) {
    const snapshots = originalTextNodes.get(element) ?? new Map<Text, string>();
    nodes.forEach((node) => {
      if (!snapshots.has(node)) snapshots.set(node, node.textContent ?? '');
    });
    originalTextNodes.set(element, snapshots);
    nodes[0].textContent = value;
    nodes.slice(1).forEach((node) => { node.textContent = ''; });
    return;
  }
  if (element.childElementCount === 0) {
    const snapshots = originalTextNodes.get(element) ?? new Map<Text, string>();
    originalTextNodes.set(element, snapshots);
    element.textContent = value;
  }
}

function restoreDirectText(element: HTMLElement) {
  const snapshots = originalTextNodes.get(element);
  if (!snapshots) return;
  snapshots.forEach((value, node) => {
    if (node.isConnected) node.textContent = value;
  });
}

function applyElementOverrides(settings: VisualSettingsDraft, scope: VisualInterfaceScope) {
  if (typeof document === 'undefined') return;
  const id = 'quickbite-visual-element-overrides';
  let style = document.getElementById(id) as HTMLStyleElement | null;
  const baseOverrides = settings.element_overrides ?? {};
  const scopedOverrides = settings.interface_overrides?.[scope]?.element_overrides ?? {};
  const overrides = { ...baseOverrides, ...scopedOverrides };
  const css = Object.entries(overrides).map(([selector, rawStyle]) => {
    const safeStyle = sanitizeVisualElementStyle(rawStyle);
    const declarations = Object.entries(safeStyle)
      .filter(([key]) => key !== 'textContent')
      .map(([key, value]) => `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${value} !important`)
      .join(';');

    if (safeStyle.textContent !== undefined) {
      try { document.querySelectorAll<HTMLElement>(selector).forEach((element) => replaceDirectText(element, safeStyle.textContent!)); }
      catch { /* invalid selector is rejected during sanitization */ }
    } else {
      try { document.querySelectorAll<HTMLElement>(selector).forEach(restoreDirectText); }
      catch { /* ignore */ }
    }

    return declarations
      ? `${selector.startsWith(ROOT_SELECTOR) ? selector : `${ROOT_SELECTOR}[data-qb-visual-preview-scope="${scope}"] ${selector}`}{${declarations}}`
      : '';
  }).filter(Boolean).join('\n');

  if (!css) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    style.dataset.qbVisualElementOverrides = 'true';
    document.head.appendChild(style);
  }
  style.textContent = css;
}

function readStoredPreview(): VisualSettingsDraft | null {
  if (typeof window === 'undefined' || !isVisualPreviewMode()) return null;
  try {
    const raw = window.localStorage.getItem(PREVIEW_STORAGE_KEY);
    return raw ? sanitizeVisualSettings(JSON.parse(raw) as Partial<VisualSettingsDraft>) : null;
  } catch {
    return null;
  }
}

function toStoredSettings(draft: VisualSettingsDraft, previous: VisualSettings): VisualSettings {
  return { ...draft, id: true, updated_at: previous.updated_at, updated_by: previous.updated_by };
}

export function VisualThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<VisualSettings>({ ...DEFAULT_VISUAL_SETTINGS, id: true, updated_at: new Date(0).toISOString(), updated_by: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<VisualSettingsDraft | null>(readStoredPreview);
  const [scope, setScope] = useState<VisualInterfaceScope>(getVisualInterfaceScope);

  const refresh = useCallback(async () => {
    if (!hasSupabaseConfig() || isVisualPreviewMode()) return;
    setLoading(true);
    try {
      setSettings(await loadVisualSettings());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la configuración visual.');
    } finally {
      setLoading(false);
    }
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
    if (preview) return resolveVisualSettings(preview, scope);
    return resolveVisualSettings(settings, scope);
  }, [preview, settings, scope]);

  useEffect(() => {
    const storedOverride = settings.interface_overrides?.[scope];
    const active = Boolean(preview) || isVisualPreviewMode() || Boolean(storedOverride && Object.keys(storedOverride).length);
    applyDocumentTheme(effectiveSettings, scope, active);
    applyElementOverrides(effectiveSettings, scope);
  }, [effectiveSettings, preview, scope, settings.interface_overrides]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !event.data) return;
      const data = event.data as { type?: string; settings?: unknown };
      if (data.type === 'quickbite-visual-preview' && data.settings && typeof data.settings === 'object') {
        setPreview(sanitizeVisualSettings(data.settings as Partial<VisualSettingsDraft>));
        return;
      }
      if (data.type === 'quickbite-visual-preview-clear') {
        setPreview(null);
        return;
      }
      if ((data.type === 'quickbite-visual-element-edit' || data.type === 'quickbite-visual-element-reset') && isVisualPreviewMode() && data.settings && typeof data.settings === 'object') {
        setPreview(sanitizeVisualSettings(data.settings as Partial<VisualSettingsDraft>));
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== PREVIEW_STORAGE_KEY) return;
      try { setPreview(event.newValue ? sanitizeVisualSettings(JSON.parse(event.newValue) as Partial<VisualSettingsDraft>) : null); }
      catch { setPreview(null); }
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !isVisualPreviewMode() || !window.opener) return;
    try { window.opener.postMessage({ type: 'quickbite-visual-preview-ready' }, window.location.origin); }
    catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || settings.theme_mode !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      if (preview) return;
      applyDocumentTheme(effectiveSettings, scope, false);
    };
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, [preview, settings.theme_mode, effectiveSettings, scope]);

  useEffect(() => {
    if (!hasSupabaseConfig() || isVisualPreviewMode()) return;
    try {
      const client = requireSupabaseClient();
      const channel = client.channel('quickbite-visual-settings')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_visual_settings' }, (payload) => {
          if (payload.new && typeof payload.new === 'object') void loadVisualSettings(client).then(setSettings).catch(() => undefined);
        })
        .subscribe();
      return () => { void channel.unsubscribe(); };
    } catch {
      return undefined;
    }
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