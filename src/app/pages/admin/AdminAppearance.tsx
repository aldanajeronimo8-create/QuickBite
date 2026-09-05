import { Palette } from 'lucide-react';
import { VisualSettingsPanel } from '../../components/admin/VisualSettings/VisualSettingsPanel';

export function AdminAppearance() {
  return <div className="min-w-0"><div className="mb-5 flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-950"><Palette className="h-5 w-5 text-blue-700" /><div><p className="font-black">Editor visual seguro</p><p className="text-xs text-blue-800">Solo modifica apariencia y branding. La lógica, los datos, los permisos y las integraciones permanecen fuera de este editor.</p></div></div><VisualSettingsPanel /></div>;
}
