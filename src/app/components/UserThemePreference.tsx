import { useMemo } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { isVisualPreviewMode, useVisualTheme } from '../contexts/VisualThemeProvider';
import { useAuthStore } from '../../store/authStore';
import type { ThemeMode } from '../../types/visualSettings';

type UserThemePreferenceProps = { showControl?: boolean };

export function UserThemePreference({ showControl = false }: UserThemePreferenceProps) {
  const user = useAuthStore((state) => state.user);
  const { userThemeMode, userThemeLoading, setUserThemeMode } = useVisualTheme();
  const authenticated = Boolean(user && user.id && !user.id.startsWith('visual-preview-') && !isVisualPreviewMode());
  const mode = userThemeMode ?? 'system';

  const options = useMemo(() => [
    { value: 'light' as const, label: 'Claro', description: 'Fondo claro y alto contraste', icon: Sun },
    { value: 'dark' as const, label: 'Oscuro', description: 'Superficies oscuras y contraste equilibrado', icon: Moon },
    { value: 'system' as const, label: 'Sistema', description: 'Sigue la apariencia de tu dispositivo', icon: Monitor },
  ], []);

  if (!authenticated || !showControl) return null;

  const changeMode = async (next: ThemeMode) => {
    if (next === mode || userThemeLoading) return;
    try {
      await setUserThemeMode(next);
      toast.success(`Apariencia cambiada a ${next === 'dark' ? 'modo oscuro' : next === 'light' ? 'modo claro' : 'apariencia del sistema'}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la preferencia de apariencia.');
    }
  };

  return (
    <section className="qb-surface rounded-[2rem] border qb-border p-6 shadow-[var(--qb-shadow)] sm:p-7">
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--qb-surface-muted)] text-[var(--qb-text-secondary)] ring-1 ring-[var(--qb-border)]">
            {mode === 'dark' ? <Moon className="h-5 w-5" /> : mode === 'light' ? <Sun className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[.18em] text-[var(--qb-primary)]">Preferencia personal</p>
            <h2 className="mt-1 text-xl font-black text-[var(--qb-text)]">Apariencia de la App</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--qb-text-secondary)]">Elige cómo quieres ver QuickBite. Este ajuste afecta solo a tu cuenta y no modifica la personalización global.</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Apariencia de la App">
          {options.map(({ value, label, description, icon: Icon }) => {
            const active = mode === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={userThemeLoading}
                onClick={() => void changeMode(value)}
                className="flex items-center gap-3 rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-4 focus:ring-[color-mix(in_srgb,var(--qb-primary)_18%,transparent)] disabled:cursor-wait disabled:opacity-60"
                style={{
                  borderColor: active ? 'var(--qb-primary)' : 'var(--qb-border)',
                  background: active ? 'color-mix(in srgb, var(--qb-primary) 9%, var(--qb-surface))' : 'var(--qb-surface-muted)',
                }}
              >
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-xl"
                  style={{
                    background: active ? 'var(--qb-primary)' : 'var(--qb-surface-elevated)',
                    color: active ? '#FFFFFF' : 'var(--qb-text-secondary)',
                    boxShadow: active ? 'none' : 'inset 0 0 0 1px var(--qb-border)',
                  }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-[var(--qb-text)]">{label}</span>
                  <span className="mt-0.5 block text-xs text-[var(--qb-text-muted)]">{description}</span>
                </span>
                {active && <Check className="h-5 w-5 shrink-0 text-[var(--qb-primary)]" />}
              </button>
            );
          })}
        </div>

        <p className="text-xs font-medium text-[var(--qb-text-muted)]">
          Preferencia actual: <span className="font-black text-[var(--qb-text-secondary)]">{mode === 'dark' ? 'Modo oscuro' : mode === 'light' ? 'Modo claro' : 'Seguir sistema'}</span>
        </p>
      </div>
    </section>
  );
}
