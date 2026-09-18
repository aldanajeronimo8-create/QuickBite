import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { requireSupabaseClient } from '../../lib/supabase';
import { resolveThemeMode, type ResolvedThemeMode } from '../../lib/themeEngine';
import { useAuthStore } from '../../store/authStore';
import type { ThemeMode } from '../../types/theme';

type VisualThemeContextValue = { userThemeMode: ThemeMode; userThemeLoading: boolean; setUserThemeMode: (mode: ThemeMode) => Promise<void>; resolvedThemeMode: ResolvedThemeMode };
const VisualThemeContext = createContext<VisualThemeContextValue | null>(null);
const THEME_STORAGE_PREFIX = 'quickbite_theme_preference_v2';
type ThemeStorageKey = `${typeof THEME_STORAGE_PREFIX}:${string}`;
const isThemeMode = (value: unknown): value is ThemeMode => value === 'light' || value === 'dark' || value === 'system';
const getThemeStorageKey = (userId: string): ThemeStorageKey => `${THEME_STORAGE_PREFIX}:${userId}`;

function readThemePreference(userId?: string): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const key = userId ? getThemeStorageKey(userId) : LAST_THEME_STORAGE_KEY;
    const stored = window.localStorage.getItem(key);
    return isThemeMode(stored) ? stored : 'light';
  } catch { return 'light'; }
}
function writeThemePreference(userId: string | undefined, mode: ThemeMode) {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(getThemeStorageKey(userId), mode);
    window.localStorage.setItem(LAST_THEME_STORAGE_KEY, mode);
  } catch { /* browser storage unavailable */ }
}

export function getVisualInterfaceScope() {
  if (typeof window === 'undefined') return 'student';
  const pathname = window.location.pathname;
  return pathname.startsWith('/admin') ? 'admin' : pathname.startsWith('/parent') ? 'parent' : pathname.startsWith('/menu') || pathname.startsWith('/student') ? 'student' : 'login_student';
}
export function isVisualPreviewMode() { return false; }

export function VisualThemeProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const userId = user?.id;
  const [userThemeMode, setUserThemeModeState] = useState<ThemeMode>('light');
  const [userThemeLoading, setUserThemeLoading] = useState(false);
  const [prefersDark, setPrefersDark] = useState(false);
  const authenticated = Boolean(userId);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setPrefersDark(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // The login/public UI must keep a real light/dark appearance after logout,
    // but it must never borrow another authenticated account's preference.
    // The last authenticated preference is only a public-screen fallback;
    // each account still has its own userId-scoped preference.
    if (!userId) {
      const next = readThemePreference();
      setUserThemeLoading(false);
      setUserThemeModeState(next);
      return () => { cancelled = true; };
    }
    const cached = readThemePreference(userId);
    setUserThemeModeState(cached);
    setUserThemeLoading(true);
    const load = async () => {
      try {
        const { data, error } = await requireSupabaseClient().rpc('get_my_theme_preference');
        if (error) throw error;
        const next: ThemeMode = isThemeMode(data) ? data : 'light';
        if (!cancelled) {
          setUserThemeModeState(next);
          writeThemePreference(userId, next);
        }
      } catch {
        // Keep this user's cache only; never use another account or a global theme.
      } finally {
        if (!cancelled) setUserThemeLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [userId]);

  const resolvedThemeMode = resolveThemeMode(userThemeMode, prefersDark);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.qbTheme = resolvedThemeMode;
    root.dataset.qbAppearancePreference = userThemeMode;
    root.classList.toggle('dark', resolvedThemeMode === 'dark');
    root.style.colorScheme = resolvedThemeMode;
  }, [resolvedThemeMode, userThemeMode]);

  const setUserThemeMode = useCallback(async (next: ThemeMode) => {
    if (!authenticated || !userId || userThemeLoading || !isThemeMode(next)) return;
    const previous = userThemeMode;
    setUserThemeModeState(next);
    setUserThemeLoading(true);
    writeThemePreference(userId, next);
    try {
      const { error } = await requireSupabaseClient().rpc('set_my_theme_preference', { p_theme_mode: next });
      if (error) throw error;
    } catch (error) {
      setUserThemeModeState(previous);
      writeThemePreference(userId, previous);
      throw error instanceof Error ? error : new Error('No se pudo guardar la preferencia de apariencia.');
    } finally { setUserThemeLoading(false); }
  }, [authenticated, userId, userThemeLoading, userThemeMode]);

  const value = useMemo(() => ({ userThemeMode, userThemeLoading, setUserThemeMode, resolvedThemeMode }), [resolvedThemeMode, setUserThemeMode, userThemeLoading, userThemeMode]);
  return <VisualThemeContext.Provider value={value}>{children}</VisualThemeContext.Provider>;
}
export function useVisualTheme(): VisualThemeContextValue {
  const context = useContext(VisualThemeContext);
  if (!context) throw new Error('useVisualTheme debe utilizarse dentro de VisualThemeProvider.');
  return context;
}
