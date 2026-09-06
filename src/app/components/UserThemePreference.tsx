import { useEffect, useMemo, useState } from 'react';
import { Check, Moon, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../store/authStore';
import { requireSupabaseClient } from '../../lib/supabase';
import { getVisualCssVariables } from '../../types/visualSettings';
import { isVisualPreviewMode, useVisualTheme } from '../contexts/VisualThemeProvider';

type ThemeMode = 'light' | 'dark';

const THEME_VARIABLES = [
  '--qb-primary', '--qb-secondary', '--qb-accent', '--qb-background', '--qb-surface', '--qb-text',
  '--qb-text-secondary', '--qb-text-muted', '--qb-border', '--qb-success', '--qb-warning', '--qb-error',
  '--qb-shadow', '--background', '--foreground', '--card', '--card-foreground', '--popover', '--popover-foreground',
  '--primary', '--primary-foreground', '--secondary', '--secondary-foreground', '--accent', '--accent-foreground',
  '--destructive', '--destructive-foreground', '--border', '--input', '--ring',
];

function applyUserTheme(mode: ThemeMode, settings: ReturnType<typeof useVisualTheme>['settings']) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const themeSettings = { ...settings, theme_mode: mode };
  const variables = getVisualCssVariables(themeSettings);
  for (const name of THEME_VARIABLES) {
    const value = variables[name];
    if (value !== undefined) root.style.setProperty(name, value, 'important');
  }
  root.classList.toggle('dark', mode === 'dark');
  root.dataset.qbUserTheme = mode;
  root.style.colorScheme = mode;
}

function clearUserThemeOverride(settings: ReturnType<typeof useVisualTheme>['settings']) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const globalVariables = getVisualCssVariables(settings);
  for (const name of THEME_VARIABLES) root.style.removeProperty(name);
  Object.entries(globalVariables).forEach(([name, value]) => root.style.setProperty(name, value));
  root.classList.toggle('dark', settings.theme_mode === 'dark');
  delete root.dataset.qbUserTheme;
  root.style.removeProperty('color-scheme');
}

export function UserThemePreference() {
  const user = useAuthStore((state) => state.user);
  const { settings } = useVisualTheme();
  const [mode, setMode] = useState<ThemeMode>('light');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const authenticated = Boolean(user && user.id && !user.id.startsWith('visual-preview-') && !isVisualPreviewMode());
  const options = useMemo(() => [
    { value: 'light' as const, label: 'Claro', description: 'Interfaz clara', icon: Sun },
    { value: 'dark' as const, label: 'Oscuro', description: 'Interfaz oscura', icon: Moon },
  ], []);

  useEffect(() => {
    if (!authenticated) {
      setLoaded(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await requireSupabaseClient().rpc('get_my_theme_preference');
        if (error) throw error;
        if (!cancelled) {
          setMode(data === 'dark' ? 'dark' : 'light');
          setLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setMode('light');
          setLoaded(true);
        }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [authenticated, user?.id]);

  useEffect(() => {
    if (!authenticated || !loaded) return;
    applyUserTheme(mode, settings);
    return () => {
      if (typeof document !== 'undefined' && document.documentElement.dataset.qbUserTheme === mode) clearUserThemeOverride(settings);
    };
  }, [authenticated, loaded, mode, settings]);

  if (!authenticated || !loaded) return null;

  const changeMode = async (next: ThemeMode) => {
    if (next === mode || saving) return;
    const previous = mode;
    setMode(next);
    applyUserTheme(next, settings);
    setSaving(true);
    try {
      const { error } = await requireSupabaseClient().rpc('set_my_theme_preference', { p_theme_mode: next });
      if (error) throw error;
      setOpen(false);
    } catch (error) {
      setMode(previous);
      applyUserTheme(previous, settings);
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la preferencia de apariencia.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-[70]">
      {open && (
        <div className="mb-3 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-2xl backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95">
          <div className="px-3 pb-2 pt-2">
            <p className="text-xs font-black uppercase tracking-[.16em] text-slate-500 dark:text-slate-400">Apariencia</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Solo afecta tu propia cuenta.</p>
          </div>
          <div className="grid gap-1">
            {options.map(({ value, label, description, icon: Icon }) => {
              const active = mode === value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={saving}
                  onClick={() => void changeMode(value)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${active ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'} disabled:cursor-wait disabled:opacity-60`}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-black text-slate-900 dark:text-white">{label}</span><span className="block text-[11px] text-slate-500 dark:text-slate-400">{description}</span></span>
                  {active && <Check className="h-4 w-4 text-emerald-600" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`Apariencia: modo ${mode === 'dark' ? 'oscuro' : 'claro'}`}
        className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/90 px-4 py-3 text-sm font-black text-slate-800 shadow-xl backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900/90 dark:text-white dark:focus:ring-slate-700"
      >
        {mode === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        {mode === 'dark' ? 'Oscuro' : 'Claro'}
      </button>
    </div>
  );
}
