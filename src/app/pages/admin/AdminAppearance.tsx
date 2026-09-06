import { Palette } from 'lucide-react';
import { VisualSettingsPanel } from '../../components/admin/VisualSettings/VisualSettingsPanel';

export function AdminAppearance() {
  return (
    <div className="min-w-0 space-y-5">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700">
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <p className="font-black text-slate-950">Personalización de QuickBite</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Elige una interfaz y edita su apariencia directamente sobre una previsualización aislada. Los cambios son exclusivamente visuales y no modifican pedidos, usuarios, pagos, permisos ni lógica del sistema.
            </p>
          </div>
        </div>
      </div>
      <VisualSettingsPanel />
    </div>
  );
}
