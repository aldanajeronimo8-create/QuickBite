import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { requireSupabaseClient } from '../../lib/supabase';
import { resolveThemeMode, type ResolvedThemeMode } from '../../lib/themeEngine';
import { useAuthStore } from '../../store/authStore';
import type { ThemeMode } from '../../types/theme';

type VisualThemeContextValue = { userThemeMode: ThemeMode; userThemeLoading: boolean; setUserThemeMode: (mode: ThemeMode) => Promise<void>; resolvedThemeMode: ResolvedThemeMode };
const VisualThemeContext = createContext<VisualThemeContextValue | null>(null);
const THEME_STORAGE_KEY = 'quickbite_theme_preference_v1';

function readThemePreference(): ThemeMode { if (typeof window === 'undefined') return 'system'; try { const stored = window.localStorage.getItem(THEME_STORAGE_KEY); return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'; } catch { return 'system'; } }
function writeThemePreference(mode: ThemeMode) { try { window.localStorage.setItem(THEME_STORAGE_KEY, mode); } catch { /* ignore storage limitations */ } }

export function getVisualInterfaceScope() { if (typeof window === 'undefined') return 'student'; const pathname = window.location.pathname; return pathname.startsWith('/admin') ? 'admin' : pathname.startsWith('/parent') ? 'parent' : pathname.startsWith('/menu') || pathname.startsWith('/student') ? 'student' : 'login_student'; }
export function isVisualPreviewMode() { return false; }

export function VisualThemeProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const [userThemeMode, setUserThemeModeState] = useState<ThemeMode>(readThemePreference);
  const [userThemeLoading, setUserThemeLoading] = useState(false);
  const [prefersDark, setPrefersDark] = useState(false);
  const authenticated = Boolean(user?.id);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setPrefersDark(media.matches);
    sync(); media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await requireSupabaseClient().rpc('get_my_theme_preference');
        if (error) throw error;
        const next = data === 'dark' || data === 'system' ? data : 'light';
        if (!cancelled) { setUserThemeModeState(next); writeThemePreference(next); }
      } catch {
        // System preference remains valid even when the legacy RPC is unavailable.
        if (!cancelled && readThemePreference() === 'system') setUserThemeModeState('system');
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [authenticated, user?.id]);

  const resolvedThemeMode = resolveThemeMode(userThemeMode, prefersDark);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.qbTheme = resolvedThemeMode;
    root.dataset.qbAppearancePreference = userThemeMode;
    root.classList.toggle('dark', resolvedThemeMode === 'dark');
    root.style.colorScheme = resolvedThemeMode;
  }, [resolvedThemeMode, userThemeMode]);

  const setUserThemeMode = useCallback(async (next: ThemeMode) => {
    if (!authenticated || userThemeLoading) return;
    const previous = userThemeMode;
    setUserThemeModeState(next);
    setUserThemeLoading(true);
    writeThemePreference(next);
    try {
      if (next !== 'system') {
        const { error } = await requireSupabaseClient().rpc('set_my_theme_preference', { p_theme_mode: next });
        if (error) throw error;
      }
    } catch (error) {
      setUserThemeModeState(previous);
      writeThemePreference(previous);
      throw error instanceof Error ? error : new Error('No se pudo guardar la preferencia de apariencia.');
    } finally {
      setUserThemeLoading(false);
    }
  }, [authenticated, userThemeLoading, userThemeMode]);

  const value = useMemo(() => ({ userThemeMode, userThemeLoading, setUserThemeMode, resolvedThemeMode }), [resolvedThemeMode, setUserThemeMode, userThemeLoading, userThemeMode]);
  return <VisualThemeContext.Provider value={value}>{children}</VisualThemeContext.Provider>;
}
export function useVisualTheme(): VisualThemeContextValue { const context = useContext(VisualThemeContext); if (!context) throw new Error('useVisualTheme debe utilizarse dentro de VisualThemeProvider.'); return context; }
