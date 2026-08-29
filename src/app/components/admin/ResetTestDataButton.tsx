import { useState } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../../lib/supabase';
import { Button } from '../ui/button';

export function ResetTestDataButton({ onCompleted }: { onCompleted?: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    if (!code) {
      toast.error('Ingresa el código de confirmación.');
      return;
    }

    setResetting(true);
    try {
      const { data, error } = await requireSupabaseClient().rpc('reset_all_test_data', {
        p_confirmation_code: code,
      });
      if (error) throw error;

      const result = (data ?? {}) as { orders?: number; redemptions?: number; point_entries?: number };
      toast.success(
        `Datos reiniciados: ${result.orders ?? 0} pedidos, ${result.redemptions ?? 0} canjes y ${result.point_entries ?? 0} registros de puntos.`,
      );
      setCode('');
      setOpen(false);
      await onCompleted?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo completar el reinicio.';
      toast.error(message.includes('invalid_reset_code') ? 'Código incorrecto.' : message);
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
      >
        <RotateCcw className="mr-2 h-4 w-4" />
        Reiniciar datos de prueba
      </Button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-test-data-title"
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h2 id="reset-test-data-title" className="text-xl font-black text-slate-900">Reiniciar datos de prueba</h2>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Esta acción elimina pedidos, registros de puntos, canjes y notificaciones transaccionales. Conserva cuentas, productos, premios y configuración.
                </p>
              </div>
            </div>

            <label htmlFor="reset-confirmation-code" className="mb-2 block text-sm font-bold text-slate-700">
              Código de confirmación
            </label>
            <input
              id="reset-confirmation-code"
              type="password"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              placeholder="Ingresa el código"
              className="mb-5 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
              disabled={resetting}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setCode(''); setOpen(false); }} disabled={resetting}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void handleReset()} disabled={resetting || !code} className="bg-red-600 text-white hover:bg-red-700">
                {resetting ? 'Reiniciando...' : 'Confirmar reinicio'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
