import type { CSSProperties } from 'react';
import { getVisualCssVariables, radiusToCss, type VisualSettingsDraft } from '../../../../types/visualSettings';

type Props = { settings: VisualSettingsDraft };

export function VisualPreview({ settings }: Props) {
  const variables = getVisualCssVariables(settings);
  const style = variables as CSSProperties;
  return (
    <section className="sticky top-6 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Vista previa</p>
        <p className="mt-1 text-sm font-bold text-slate-900">Así se verá la identidad visual</p>
      </div>
      <div style={style} className="p-5" data-qb-preview>
        <div style={{ background: 'var(--qb-background)', color: 'var(--qb-text)', fontFamily: 'var(--qb-font-family)', borderRadius: radiusToCss('large') }} className="min-h-[520px] overflow-hidden border p-4">
          <div className="flex items-center justify-between gap-3 rounded-[var(--qb-card-radius)] border border-[var(--qb-border)] bg-[var(--qb-surface)] p-3 shadow-[var(--qb-shadow)]">
            <div className="flex min-w-0 items-center gap-3">
              {settings.logo_url ? <img src={settings.logo_url} alt="Logo" className="h-9 w-9 shrink-0 object-contain" /> : <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--qb-button-radius)] bg-[var(--qb-primary)] text-xs font-black text-white">QB</div>}
              <div className="min-w-0"><p className="truncate text-sm font-black" style={{ fontFamily: 'var(--qb-heading-font)' }}>{settings.app_name}</p><p className="text-[11px] opacity-70">Vista de ejemplo</p></div>
            </div>
            <span className="rounded-full px-2.5 py-1 text-[10px] font-black" style={{ background: 'color-mix(in srgb, var(--qb-accent) 16%, transparent)', color: 'var(--qb-accent)' }}>Activo</span>
          </div>
          <div className="mt-5 grid gap-3">
            <div className="rounded-[var(--qb-card-radius)] border border-[var(--qb-border)] bg-[var(--qb-surface)] p-4 shadow-[var(--qb-shadow)]">
              <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: 'var(--qb-muted-text)' }}>Menú de hoy</p>
              <p className="mt-1 text-lg font-black" style={{ fontFamily: 'var(--qb-heading-font)' }}>Tu comida, más fácil</p>
              <p className="mt-1 text-xs opacity-70">Selecciona tus productos y recoge tu pedido sin filas innecesarias.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="px-4 py-2 text-xs font-black text-white" style={{ background: 'var(--qb-primary)', borderRadius: 'var(--qb-button-radius)' }}>Comprar ahora</button>
                <button type="button" className="px-4 py-2 text-xs font-black" style={{ background: 'color-mix(in srgb, var(--qb-secondary) 12%, transparent)', color: 'var(--qb-secondary)', borderRadius: 'var(--qb-button-radius)' }}>Ver menú</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[var(--qb-card-radius)] border border-[var(--qb-border)] bg-[var(--qb-surface)] p-3"><p className="text-[10px] opacity-60">Estado</p><p className="mt-1 text-sm font-black" style={{ color: 'var(--qb-success)' }}>Listo</p></div>
              <div className="rounded-[var(--qb-card-radius)] border border-[var(--qb-border)] bg-[var(--qb-surface)] p-3"><p className="text-[10px] opacity-60">Saldo</p><p className="mt-1 text-sm font-black">$25.000</p></div>
            </div>
            <input readOnly value="Ejemplo de campo de texto" className="w-full border px-3 py-2 text-xs outline-none" style={{ borderColor: 'var(--qb-border)', borderRadius: 'var(--qb-button-radius)', background: 'var(--qb-surface)', color: 'var(--qb-text)' }} />
          </div>
        </div>
      </div>
    </section>
  );
}
