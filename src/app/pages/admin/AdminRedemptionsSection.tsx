import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, Gift, X } from 'lucide-react';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../../lib/supabase';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';

type Redemption = {
  id: string;
  redemption_code: string;
  points_spent: number;
  status: 'pending' | 'reserved' | 'approved' | 'delivered' | 'cancelled' | string;
  created_at: string;
  admin_hidden?: boolean;
  reward?: { title?: string | null; product?: { name?: string | null } | null } | null;
  user?: { full_name?: string | null; email?: string | null } | null;
};

export function AdminRedemptionsSection() {
  const [items, setItems] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data, error } = await requireSupabaseClient()
        .from('loyalty_redemptions')
        .select('id,redemption_code,points_spent,status,created_at,admin_hidden,reward:loyalty_rewards(title,product:products(name)),user:profiles!loyalty_redemptions_user_id_fkey(full_name,email)')
        .eq('admin_hidden', false)
        .in('status', ['pending', 'reserved'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      setItems((data ?? []) as unknown as Redemption[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar las solicitudes de canje.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const supabase = requireSupabaseClient();
    const channel = supabase
      .channel('quickbite-admin-redemptions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loyalty_redemptions' }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const changeStatus = async (id: string, status: 'approved' | 'cancelled') => {
    if (updating) return;
    setUpdating(id);
    try {
      const { data, error } = await requireSupabaseClient().rpc('moderate_loyalty_redemption', {
        p_redemption_id: id,
        p_status: status,
      });
      if (error) throw error;
      const updated = Array.isArray(data) ? data[0] : data;
      setItems((current) => status === 'approved' || status === 'cancelled'
        ? current.filter((item) => item.id !== id)
        : current.map((item) => item.id === id ? { ...item, status: updated?.status ?? status } : item));
      toast.success(status === 'approved'
        ? 'Canje aprobado y convertido en pedido especial CANJE.'
        : 'Canje rechazado y stock restaurado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el canje.');
    } finally {
      setUpdating(null);
    }
  };

  return (
    <section className="mb-6">
      <Card className="overflow-hidden border border-green-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-green-50/60"
        >
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-green-100 text-green-700"><Gift className="h-5 w-5" /></div>
            <div>
              <h2 className="text-xl font-black text-green-800">Solicitudes de canje</h2>
              <p className="mt-0.5 text-sm text-slate-600">Aprueba un canje para convertirlo automáticamente en un pedido especial CANJE.</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Badge className={items.length ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}>{items.length} pendiente(s)</Badge>
            <ChevronDown className={`h-5 w-5 text-green-800 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {expanded && <div className="border-t border-green-100 p-5">
          {loading ? <p className="text-sm text-slate-500">Cargando solicitudes...</p>
            : items.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">No hay canjes pendientes de aprobación.</p>
              : <div className="space-y-3">{items.map((item) => {
                const rewardName = item.reward?.title ?? item.reward?.product?.name ?? 'Recompensa';
                return <Card key={item.id} className="border-green-100 bg-white p-4 shadow-sm"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-green-50 text-green-700"><Gift className="h-5 w-5" /></div><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-green-700 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-white">CANJE</span><Badge className="bg-amber-100 text-amber-800">Pendiente</Badge></div><h3 className="mt-2 text-lg font-black text-slate-900">{rewardName}</h3><p className="text-sm font-bold text-green-800">{item.points_spent} puntos · Código {item.redemption_code}</p><p className="mt-1 text-xs text-slate-500">{item.user?.full_name ?? 'Estudiante'}{item.user?.email ? ` · ${item.user.email}` : ''}</p><p className="mt-1 text-xs text-slate-500">{new Date(item.created_at).toLocaleString('es-CO')}</p></div></div><div className="flex gap-2 md:shrink-0"><Button disabled={updating === item.id} onClick={() => void changeStatus(item.id, 'approved')} className="bg-green-600 text-white hover:bg-green-700"><Check className="h-4 w-4" />Aprobar</Button><Button disabled={updating === item.id} variant="outline" onClick={() => void changeStatus(item.id, 'cancelled')} className="border-red-300 text-red-700 hover:bg-red-50"><X className="h-4 w-4" />Rechazar</Button></div></div></Card>;
              })}</div>}
        </div>}
      </Card>
    </section>
  );
}
