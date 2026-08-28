import { useCallback, useEffect, useState } from 'react';
import { Check, Gift, X } from 'lucide-react';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../../lib/supabase';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';

type Redemption = {
  id: string;
  redemption_code: string;
  points_spent: number;
  status: 'pending' | 'approved' | 'delivered' | 'cancelled' | string;
  created_at: string;
  reward?: { title?: string | null; name?: string | null; product?: { name?: string | null } | null } | null;
  user?: { full_name?: string | null; email?: string | null } | null;
};

export function AdminRedemptionsSection() {
  const [items, setItems] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const client = requireSupabaseClient();
      const { data, error } = await client
        .from('loyalty_redemptions')
        .select('id,redemption_code,points_spent,status,created_at,reward:loyalty_rewards(title,name,product:products(name)),user:profiles!loyalty_redemptions_user_id_fkey(full_name,email)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setItems((data ?? []) as unknown as Redemption[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar los canjes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const changeStatus = async (id: string, status: 'approved' | 'cancelled') => {
    if (updating) return;
    setUpdating(id);
    try {
      const { error } = await requireSupabaseClient().from('loyalty_redemptions').update({ status }).eq('id', id);
      if (error) throw error;
      setItems((current) => current.map((item) => item.id === id ? { ...item, status } : item));
      toast.success(status === 'approved' ? 'Canje aprobado.' : 'Canje rechazado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el canje.');
    } finally {
      setUpdating(null);
    }
  };

  const pending = items.filter((item) => item.status === 'pending');

  return (
    <section className="mb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-green-800">Canjes en pedidos</h2>
          <p className="mt-1 text-sm text-slate-600">Revisa, aprueba o rechaza los canjes solicitados por estudiantes.</p>
        </div>
        <Badge className="bg-amber-100 text-amber-800">{pending.length} pendiente(s)</Badge>
      </div>
      {loading ? <Card className="p-6 text-sm text-slate-500">Cargando canjes...</Card> : items.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-slate-500">No hay canjes registrados.</Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const rewardName = item.reward?.title ?? item.reward?.name ?? item.reward?.product?.name ?? 'Recompensa';
            const isPending = item.status === 'pending';
            const statusClass = item.status === 'approved' ? 'bg-green-100 text-green-800' : item.status === 'cancelled' ? 'bg-red-100 text-red-800' : item.status === 'delivered' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800';
            const statusLabel = item.status === 'approved' ? 'Aprobado' : item.status === 'cancelled' ? 'Rechazado' : item.status === 'delivered' ? 'Entregado' : 'Pendiente';
            return (
              <Card key={item.id} className="border-green-100 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-green-50 text-green-700"><Gift className="h-5 w-5" /></div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-green-700 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-white">Canje</span>
                        <Badge className={statusClass}>{statusLabel}</Badge>
                      </div>
                      <h3 className="mt-2 text-lg font-black text-slate-900">{rewardName}</h3>
                      <p className="text-sm font-bold text-green-800">{item.points_spent} puntos canjeados</p>
                      <p className="mt-1 text-xs text-slate-500">{item.user?.full_name ?? 'Estudiante'}{item.user?.email ? ` · ${item.user.email}` : ''}</p>
                      <p className="mt-1 text-xs text-slate-500">Código: <b>{item.redemption_code}</b> · {new Date(item.created_at).toLocaleString('es-CO')}</p>
                    </div>
                  </div>
                  {isPending && (
                    <div className="flex gap-2 md:shrink-0">
                      <Button disabled={updating === item.id} onClick={() => void changeStatus(item.id, 'approved')} className="bg-green-600 text-white hover:bg-green-700"><Check className="h-4 w-4" />Aprobar</Button>
                      <Button disabled={updating === item.id} variant="outline" onClick={() => void changeStatus(item.id, 'cancelled')} className="border-red-300 text-red-700 hover:bg-red-50"><X className="h-4 w-4" />Rechazar</Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
