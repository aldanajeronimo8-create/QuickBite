import { useState } from 'react';
import { Gift, Loader2, RefreshCw, Star, TicketCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useLoyalty } from '../../../hooks/useLoyalty';
import { getErrorMessage } from '../../../lib/getErrorMessage';
import { updateLoyaltySettings } from '../../../repositories/quickbiteRepository';
import { useAuthStore } from '../../../store/authStore';
import { useDataStore } from '../../../store/dataStore';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';

const statusLabel = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

export function AdminLoyalty() {
  const user = useAuthStore((state) => state.user);
  const orders = useDataStore((state) => state.orders);
  const { settings, rewards, redemptions, points, loading, error, refresh, redeem } = useLoyalty(
    user?.id,
    orders,
  );
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [updatingSettings, setUpdatingSettings] = useState(false);

  const toggleProgram = async () => {
    if (!settings) return;
    setUpdatingSettings(true);
    try {
      await updateLoyaltySettings({ enabled: !settings.enabled });
      await refresh();
      toast.success(settings.enabled ? 'Programa de puntos desactivado.' : 'Programa de puntos activado.');
    } catch (cause) {
      toast.error(getErrorMessage(cause));
    } finally {
      setUpdatingSettings(false);
    }
  };

  const handleRedeem = async (rewardId: string) => {
    setRedeemingId(rewardId);
    try {
      await redeem(rewardId);
      toast.success('Canje registrado. Revisa el historial para su entrega.');
    } catch (cause) {
      toast.error(getErrorMessage(cause));
    } finally {
      setRedeemingId(null);
    }
  };

  if (loading && !settings) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-slate-600">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-4xl font-bold text-blue-900">
            <Gift className="h-9 w-9" />
            Puntos y premios
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            Tus puntos y premios se consultan directamente desde Supabase.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {error && <Card className="border-red-200 bg-red-50 p-4 text-red-800">{error}</Card>}

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="border-0 bg-gradient-to-br from-amber-400 to-orange-500 p-6 text-white shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-amber-50">Mis puntos</p>
              <p className="mt-2 text-5xl font-black">{points}</p>
              <p className="mt-2 text-sm text-amber-50">
                {settings
                  ? `${settings.points_per_amount} punto por cada $${settings.currency_amount.toLocaleString()} confirmado.`
                  : 'Configuración no disponible.'}
              </p>
            </div>
            <Star className="h-10 w-10 fill-white/20" />
          </div>
        </Card>
        <Card className="border-0 bg-white p-6 shadow-lg">
          <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Programa</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {settings?.enabled ? 'Activo' : 'Pausado'}
              </p>
              <p className="mt-1 text-sm text-slate-600">Solo administradores pueden cambiar esta configuración.</p>
            </div>
            <Button
              onClick={() => void toggleProgram()}
              disabled={!settings || updatingSettings}
              variant={settings?.enabled ? 'outline' : 'default'}
            >
              {updatingSettings ? 'Guardando...' : settings?.enabled ? 'Pausar' : 'Activar'}
            </Button>
          </div>
        </Card>
      </div>

      <Card className="border-0 bg-white p-6 shadow-lg">
        <div className="mb-5 flex items-center gap-3">
          <Gift className="h-6 w-6 text-orange-500" />
          <h2 className="text-2xl font-bold text-blue-950">Premios disponibles</h2>
        </div>
        {rewards.length === 0 ? (
          <p className="py-8 text-center text-slate-500">Aún no hay premios registrados en Supabase.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rewards.map((reward) => {
              const available =
                Boolean(settings?.enabled) &&
                reward.active &&
                (reward.stock == null || reward.stock > 0) &&
                points >= reward.points_cost;
              return (
                <div key={reward.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-slate-900">{reward.title}</h3>
                      {reward.description && <p className="mt-1 text-sm text-slate-600">{reward.description}</p>}
                    </div>
                    <Badge className="bg-amber-100 text-amber-900">{reward.points_cost} pts</Badge>
                  </div>
                  <p className="mt-4 text-xs text-slate-500">
                    {reward.stock == null ? 'Disponibilidad ilimitada' : `${reward.stock} disponible(s)`}
                  </p>
                  <Button
                    className="mt-3 w-full bg-orange-500 text-white hover:bg-orange-600"
                    disabled={!available || redeemingId === reward.id}
                    onClick={() => void handleRedeem(reward.id)}
                  >
                    {redeemingId === reward.id ? 'Canjeando...' : 'Canjear premio'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="border-0 bg-white p-6 shadow-lg">
        <div className="mb-5 flex items-center gap-3">
          <TicketCheck className="h-6 w-6 text-blue-700" />
          <h2 className="text-2xl font-bold text-blue-950">Historial de canjes</h2>
        </div>
        {redemptions.length === 0 ? (
          <p className="py-6 text-center text-slate-500">Aún no has realizado canjes.</p>
        ) : (
          <div className="space-y-3">
            {redemptions.map((redemption) => (
              <div key={redemption.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
                <div>
                  <p className="font-bold text-slate-900">{redemption.reward?.title ?? 'Premio'}</p>
                  <p className="text-sm text-slate-600">
                    {new Date(redemption.created_at).toLocaleDateString('es-CO')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-orange-600">-{redemption.points_spent} pts</span>
                  <Badge variant="outline">{statusLabel[redemption.status]}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
