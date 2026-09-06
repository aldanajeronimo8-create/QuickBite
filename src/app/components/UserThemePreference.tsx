import { useEffect, useMemo, useState } from 'react';
import { Check, Moon, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../store/authStore';
import { requireSupabaseClient } from '../../lib/supabase';
import { getVisualCssVariables } from '../../types/visualSettings';
import { isVisualPreviewMode, useVisualTheme } from '../contexts/VisualThemeProvider';

type ThemeMode = 'light' | 'dark';
type UserThemePreferenceProps = { showControl?: boolean };

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

export function UserThemePreference({ showControl = false }: UserThemePreferenceProps) {
  const user = useAuthStore((state) => state.user);
  const { settings } = useVisualTheme();
  const [mode, setMode] = useState<ThemeMode>('light');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const authenticated = Boolean(user && user.id && !user.id.startsWith('visual-preview-') && !isVisualPreviewMode());
  const options = useMemo(() => [
    { value: 'light' as const, label: 'Claro', description: 'Fondo claro y alto contraste', icon: Sun },
    { value: 'dark' as const, label: 'Oscuro', description: 'Fondo oscuro y cómodo para la vista', icon: Moon },
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

  if (!authenticated || !loaded || !showControl) return null;

  const changeMode = async (next: ThemeMode) => {
    if (next === mode || saving) return;
    const previous = mode;
    setMode(next);
    applyUserTheme(next, settings);
    setSaving(true);
    try {
      const { error } = await requireSupabaseClient().rpc('set_my_theme_preference', { p_theme_mode: next });
      if (error) throw error;
      toast.success(`Apariencia cambiada a modo ${next === 'dark' ? 'oscuro' : 'claro'}.`);
    } catch (error) {
      setMode(previous);
      applyUserTheme(previous, settings);
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la preferencia de apariencia.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-6 shadow-xl backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/75 sm:p-7">
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700">
            {mode === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[.18em] text-emerald-700 dark:text-emerald-400">Preferencia personal</p>
            <h2 className="mt-1 text-xl font-black text-slate-900 dark:text-white">Apariencia de la App</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Elige cómo quieres ver QuickBite. Este ajuste solo afecta a tu cuenta y no modifica la personalización global.</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Apariencia de la App">
          {options.map(({ value, label, description, icon: Icon }) => {
            const active = mode === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={saving}
                onClick={() => void changeMode(value)}
                className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-4 focus:ring-emerald-100 dark:focus:ring-emerald-950 ${active ? 'border-emerald-500 bg-emerald-50 shadow-sm dark:border-emerald-400 dark:bg-emerald-950/40' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800/80 dark:hover:border-slate-600 dark:hover:bg-slate-800'} disabled:cursor-wait disabled:opacity-60`}
              >
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${active ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700'}`}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-black text-slate-900 dark:text-white">{label}</span><span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{description}</span></span>
                {active && <Check className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
              </button>
            );
          })}
        </div>

        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Preferencia actual: <span className="font-black text-slate-700 dark:text-slate-200">{mode === 'dark' ? 'Modo oscuro' : 'Modo claro'}</span></p>
      </div>
    </section>
  );
}
