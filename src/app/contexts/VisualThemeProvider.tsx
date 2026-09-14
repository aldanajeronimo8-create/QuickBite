import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { hasSupabaseConfig } from '../../config/appConfig';
import { requireSupabaseClient } from '../../lib/supabase';
import { getThemeRuntimeVariables, resolveThemeMode, type ResolvedThemeMode } from '../../lib/themeEngine';
import { useAuthStore } from '../../store/authStore';
import { DEFAULT_VISUAL_SETTINGS, resolveVisualSettings, type VisualInterfaceScope, type VisualSettings, type VisualSettingsDraft, type ThemeMode } from '../../types/visualSettings';

type VisualThemeContextValue = { settings: VisualSettings; loading: boolean; error: string | null; refresh: () => Promise<void>; applyLocal: (draft: VisualSettingsDraft) => void; userThemeMode: ThemeMode | null; userThemeLoading: boolean; setUserThemeMode: (mode: ThemeMode) => Promise<void>; resolvedThemeMode: ResolvedThemeMode };
const VisualThemeContext = createContext<VisualThemeContextValue | null>(null);
const VALID_SCOPES: VisualInterfaceScope[] = ['login_student','login_parent','login_admin','admin','student','parent'];
const SYSTEM_THEME_STORAGE_KEY = 'quickbite_theme_preference_v1';

function getPathScope(pathname: string, search: string): VisualInterfaceScope | null { const params = new URLSearchParams(search); const previewRole = params.get('preview_role'); if ((pathname === '/' || pathname === '/login') && (previewRole === 'student' || previewRole === 'parent' || previewRole === 'admin')) return `login_${previewRole}` as VisualInterfaceScope; if (pathname.startsWith('/admin')) return 'admin'; if (pathname.startsWith('/parent')) return 'parent'; if (pathname.startsWith('/menu') || pathname.startsWith('/student')) return 'student'; return null; }
export function getVisualPreviewScope(): VisualInterfaceScope | null { if (typeof window === 'undefined') return null; const direct = getPathScope(window.location.pathname, window.location.search); if (direct) return direct; return null; }
export function isVisualPreviewMode(): boolean { if (typeof window === 'undefined') return false; return new URLSearchParams(window.location.search).get('visual_preview') === '1' && Boolean(getVisualPreviewScope()); }
export function getVisualInterfaceScope(): VisualInterfaceScope { if (typeof document !== 'undefined') { const explicit = document.querySelector<HTMLElement>('[data-qb-interface]')?.dataset.qbInterface; if (explicit && VALID_SCOPES.includes(explicit as VisualInterfaceScope)) return explicit as VisualInterfaceScope; } if (typeof window !== 'undefined') { const scope = getPathScope(window.location.pathname, window.location.search); if (scope) return scope; } return 'student'; }

function readLocalSystemPreference(): ThemeMode | null { if (typeof window === 'undefined') return null; try { const value = window.localStorage.getItem(SYSTEM_THEME_STORAGE_KEY); return value === 'light' || value === 'dark' || value === 'system' ? value : null; } catch { return null; } }
function writeLocalSystemPreference(mode: ThemeMode) { if (typeof window === 'undefined') return; try { window.localStorage.setItem(SYSTEM_THEME_STORAGE_KEY, mode); } catch { /* localStorage may be unavailable */ } }

function applyDocumentTheme(settings: VisualSettingsDraft, scope: VisualInterfaceScope, active: boolean, mode: ResolvedThemeMode) { if (typeof document === 'undefined') return; const root = document.documentElement; Object.entries(getThemeRuntimeVariables(settings)).forEach(([name, value]) => root.style.setProperty(name, value)); root.dataset.qbTheme = mode; root.dataset.qbAppearancePreference = settings.theme_mode; root.dataset.qbVisualPreview = '0'; root.dataset.qbVisualPreviewScope = scope; root.dataset.qbVisualActive = active ? '1' : '0'; root.classList.toggle('dark', mode === 'dark'); root.style.setProperty('color-scheme', mode); document.title = settings.app_name; }

export function VisualThemeProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const [settings, setSettings] = useState<VisualSettings>({ ...DEFAULT_VISUAL_SETTINGS, id: true, updated_at: new Date(0).toISOString(), updated_by: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<VisualInterfaceScope>(getVisualInterfaceScope);
  const [userThemeMode, setUserThemeModeState] = useState<ThemeMode | null>(readLocalSystemPreference);
  const [userThemeLoading, setUserThemeLoading] = useState(false);
  const [prefersDark, setPrefersDark] = useState(false);
  const authenticated = Boolean(user && user.id && !user.id.startsWith('visual-preview-') && !isVisualPreviewMode());

  const refresh = useCallback(async () => { if (!hasSupabaseConfig() || isVisualPreviewMode()) return; setLoading(false); }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (typeof document === 'undefined') return; const sync = () => setScope(getVisualInterfaceScope()); sync(); const observer = new MutationObserver(sync); observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-qb-interface'] }); window.addEventListener('popstate', sync); return () => { observer.disconnect(); window.removeEventListener('popstate', sync); }; }, []);
  useEffect(() => { if (typeof window === 'undefined') return; const media = window.matchMedia('(prefers-color-scheme: dark)'); const sync = () => setPrefersDark(media.matches); sync(); media.addEventListener?.('change', sync); return () => media.removeEventListener?.('change', sync); }, []);
  useEffect(() => { if (!authenticated) return; let cancelled = false; setUserThemeLoading(true); const load = async () => { const local = readLocalSystemPreference(); if (local) { if (!cancelled) setUserThemeModeState(local); setUserThemeLoading(false); return; } try { const { data, error: rpcError } = await requireSupabaseClient().rpc('get_my_theme_preference'); if (rpcError) throw rpcError; const next = data === 'dark' || data === 'system' ? data : 'light'; if (!cancelled) setUserThemeModeState(next); writeLocalSystemPreference(next); } catch { if (!cancelled) setUserThemeModeState('system'); } finally { if (!cancelled) setUserThemeLoading(false); } }; void load(); return () => { cancelled = true; }; }, [authenticated, user?.id]);
  const effectiveSettings = useMemo(() => { const base = resolveVisualSettings(settings, scope); return userThemeMode ? { ...base, theme_mode: userThemeMode } : base; }, [scope, settings, userThemeMode]);
  const resolvedThemeMode = resolveThemeMode(effectiveSettings.theme_mode, prefersDark);
  useEffect(() => { applyDocumentTheme(effectiveSettings, scope, false, resolvedThemeMode); }, [effectiveSettings, scope, resolvedThemeMode]);
  const setUserThemeMode = useCallback(async (next: ThemeMode) => { if (!authenticated || userThemeLoading) return; const previous = userThemeMode; setUserThemeModeState(next); setUserThemeLoading(true); writeLocalSystemPreference(next); try { if (next !== 'system') { const { error: rpcError } = await requireSupabaseClient().rpc('set_my_theme_preference', { p_theme_mode: next }); if (rpcError) throw rpcError; } } catch (error) { setUserThemeModeState(previous); if (previous) writeLocalSystemPreference(previous); throw error instanceof Error ? error : new Error('No se pudo guardar la preferencia de apariencia.'); } finally { setUserThemeLoading(false); } }, [authenticated, userThemeLoading, userThemeMode]);
  const applyLocal = useCallback((draft: VisualSettingsDraft) => setSettings((previous) => ({ ...previous, ...draft, id: true, updated_at: previous.updated_at, updated_by: previous.updated_by })), []);
  const value = useMemo(() => ({ settings, loading, error, refresh, applyLocal, userThemeMode, userThemeLoading, setUserThemeMode, resolvedThemeMode }), [applyLocal, error, loading, refresh, resolvedThemeMode, setUserThemeMode, settings, userThemeLoading, userThemeMode]);
  return <VisualThemeContext.Provider value={value}>{children}</VisualThemeContext.Provider>;
}
export function useVisualTheme(): VisualThemeContextValue { const context = useContext(VisualThemeContext); if (!context) throw new Error('useVisualTheme debe utilizarse dentro de VisualThemeProvider.'); return context; }
