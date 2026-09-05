import { useState } from 'react';
import { Palette, Sparkles, WandSparkles } from 'lucide-react';
import { VisualSettingsPanel } from '../../components/admin/VisualSettings/VisualSettingsPanel';
import { GuidedVisualSettings } from '../../components/admin/VisualSettings/GuidedVisualSettings';

type Mode = 'guided' | 'advanced';

export function AdminAppearance() {
  const [mode, setMode] = useState<Mode>('guided');

  return (
    <div className="min-w-0 space-y-5">
      <div className="rounded-[2rem] border border-blue-100 bg-blue-50/70 p-5 text-sm text-blue-950 sm:p-6">
        <div className="flex items-start gap-3">
          <Palette className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
          <div>
            <p className="font-black">Personalización segura de QuickBite</p>
            <p className="mt-1 text-xs leading-5 text-blue-800">Puedes personalizar la apariencia sin tocar pedidos, usuarios, permisos, pagos, autenticación, Supabase ni Google Sheets.</p>
          </div>
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2">
          <button type="button" onClick={() => setMode('guided')} className={`flex items-start gap-3 rounded-2xl px-4 py-4 text-left transition ${mode === 'guided' ? 'bg-blue-50 text-blue-950 shadow-sm ring-1 ring-blue-200' : 'text-slate-600 hover:bg-slate-50'}`}>
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white shadow-sm"><Sparkles className="size-5 text-blue-700" /></div>
            <div><p className="font-black">Personalización guiada</p><p className="mt-1 text-xs leading-5">Recomendada. Te explica cada decisión y te acompaña paso a paso.</p></div>
          </button>
          <button type="button" onClick={() => setMode('advanced')} className={`flex items-start gap-3 rounded-2xl px-4 py-4 text-left transition ${mode === 'advanced' ? 'bg-slate-100 text-slate-950 shadow-sm ring-1 ring-slate-300' : 'text-slate-600 hover:bg-slate-50'}`}>
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white shadow-sm"><WandSparkles className="size-5 text-slate-800" /></div>
            <div><p className="font-black">Personalización avanzada</p><p className="mt-1 text-xs leading-5">Para controlar colores, tipografías, tarjetas, navegación y más.</p></div>
          </button>
        </div>
      </div>

      {mode === 'guided' ? <GuidedVisualSettings onOpenAdvanced={() => setMode('advanced')} /> : <VisualSettingsPanel />}
    </div>
  );
}
