import { useMemo, useState } from 'react';
import { AlertTriangle, RotateCcw, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { useDataStore } from '../../../store/dataStore';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';

export function AdminResetPage() {
  const { user } = useAuthStore();
  const { orders, resetOrdersForNewPeriod } = useDataStore();
  const [confirmation, setConfirmation] = useState('');
  const [resetting, setResetting] = useState(false);

  const activeOrders = useMemo(() => orders.filter((order) => !order.admin_hidden), [orders]);
  const canReset = user?.role === 'admin' && confirmation.trim().toUpperCase() === 'REINICIAR';

  const handleReset = async () => {
    if (!canReset || resetting) return;
    setResetting(true);
    try {
      const count = await resetOrdersForNewPeriod();
      setConfirmation('');
      toast.success(`Flujo reiniciado. ${count} pedido(s) fueron retirados del período operativo.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo reiniciar el flujo.');
    } finally {
      setResetting(false);
    }
  };

  if (user?.role !== 'admin') {
    return <Card className="border border-red-200 bg-red-50 p-8"><div className="flex items-start gap-4"><ShieldAlert className="mt-1 h-7 w-7 text-red-600" /><div><h1 className="text-2xl font-black text-red-900">Acceso restringido</h1><p className="mt-2 text-sm text-red-800">El reinicio de períodos solo está disponible para una cuenta administrativa principal.</p></div></div></Card>;
  }

  return <div className="mx-auto max-w-3xl space-y-6">
    <div><p className="text-xs font-black uppercase tracking-[0.2em] text-red-700">Zona aislada</p><h1 className="mt-1 text-4xl font-black text-slate-900">Reiniciar flujo</h1><p className="mt-2 text-base text-slate-600">Herramienta separada de la exportación. Úsala únicamente cuando quieras cerrar el período operativo y comenzar uno nuevo.</p></div>
    <Card className="border border-red-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4"><div className="rounded-2xl bg-red-100 p-3 text-red-700"><AlertTriangle className="h-6 w-6" /></div><div><h2 className="text-xl font-black text-slate-900">Reinicio manual del período</h2><p className="mt-1 text-sm text-slate-600">Actualmente hay <strong>{activeOrders.length}</strong> pedido(s) visibles en el flujo operativo.</p></div></div>
      <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700"><p>Este proceso es independiente de <strong>Exportar a Excel</strong>.</p><p className="mt-2">Exportar no archiva, oculta ni reinicia pedidos. Reiniciar ejecuta la operación específica de cierre de período configurada para QuickBite.</p></div>
      <div className="mt-6"><label htmlFor="reset-confirm" className="mb-2 block text-sm font-bold text-slate-700">Escribe <span className="font-black text-red-700">REINICIAR</span> para confirmar</label><input id="reset-confirm" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold uppercase outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" placeholder="REINICIAR" /></div>
      <div className="mt-6 flex justify-end"><Button disabled={!canReset || resetting} onClick={() => void handleReset()} className="bg-red-600 text-white hover:bg-red-700"><RotateCcw className="mr-2 h-4 w-4" />{resetting ? 'Reiniciando...' : 'Reiniciar flujo'}</Button></div>
    </Card>
  </div>;
}
