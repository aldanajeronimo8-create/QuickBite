import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCheck, Gift, Pencil, Plus, Power, RotateCcw, Save, Star } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '../../../lib/errorMessage';
import type { AdminLoyaltyRedemption, LoyaltyReward, LoyaltySettings } from '../../../lib/supabase';
import {
  createLoyaltyReward,
  fulfillLoyaltyRedemption,
  getLoyaltySettings,
  listAdminLoyaltyRedemptions,
  listLoyaltyRewards,
  updateLoyaltyReward,
  updateLoyaltySettings,
} from '../../../repositories/quickbiteRepository';
import { useDataStore } from '../../../store/dataStore';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';

type RewardForm = {
  productId: string;
  title: string;
  description: string;
  pointsRequired: string;
  active: boolean;
};

const emptyForm: RewardForm = {
  productId: '',
  title: '',
  description: '',
  pointsRequired: '',
  active: true,
};

function toForm(reward: LoyaltyReward): RewardForm {
  return {
    productId: reward.product_id,
    title: reward.title,
    description: reward.description ?? '',
    pointsRequired: String(reward.points_required),
    active: reward.active,
  };
}

export function AdminLoyalty() {
  const { products } = useDataStore();
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [redemptions, setRedemptions] = useState<AdminLoyaltyRedemption[]>([]);
  const [form, setForm] = useState<RewardForm>(emptyForm);
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingSettings, setUpdatingSettings] = useState(false);
  const [fulfillingRedemptionId, setFulfillingRedemptionId] = useState<string | null>(null);

  const sortedProducts = useMemo(
    () => [...products].sort((left, right) => left.name.localeCompare(right.name)),
    [products],
  );

  const load = useCallback(async () => {
    try {
      const [nextSettings, nextRewards, nextRedemptions] = await Promise.all([
        getLoyaltySettings(),
        listLoyaltyRewards(true),
        listAdminLoyaltyRedemptions(),
      ]);
      setSettings(nextSettings);
      setRewards(nextRewards);
      setRedemptions(nextRedemptions);
    } catch (error) {
      toast.error(getErrorMessage(error, 'No se pudo cargar el programa de puntos.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditingRewardId(null);
    setForm(emptyForm);
  };

  const handleEnabledChange = async (enabled: boolean) => {
    if (!settings || updatingSettings) return;
    const previousSettings = settings;
    setUpdatingSettings(true);
    setSettings({ ...settings, enabled });
    try {
      const savedSettings = await updateLoyaltySettings({ enabled });
      setSettings(savedSettings);
      toast.success(enabled ? 'Programa de puntos activado.' : 'Programa de puntos desactivado.');
    } catch (error) {
      setSettings(previousSettings);
      toast.error(getErrorMessage(error, 'No se pudo actualizar el programa de puntos.'));
    } finally {
      setUpdatingSettings(false);
    }
  };

  const handleProductChange = (productId: string) => {
    const product = sortedProducts.find((item) => item.id === productId);
    setForm((current) => ({
      ...current,
      productId,
      title: current.title || product?.name || '',
    }));
  };

  const handleSave = async () => {
    const pointsRequired = Number(form.pointsRequired);
    if (!form.productId || !form.title.trim() || !Number.isInteger(pointsRequired) || pointsRequired <= 0) {
      toast.error('Selecciona un alimento, un nombre y una cantidad valida de puntos.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        product_id: form.productId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        points_required: pointsRequired,
        active: form.active,
      };
      const savedReward = editingRewardId
        ? await updateLoyaltyReward(editingRewardId, payload)
        : await createLoyaltyReward(payload);

      setRewards((current) => {
        const next = editingRewardId
          ? current.map((reward) => (reward.id === savedReward.id ? savedReward : reward))
          : [...current, savedReward];
        return next.sort((left, right) => left.points_required - right.points_required);
      });
      toast.success(editingRewardId ? 'Recompensa actualizada.' : 'Recompensa creada.');
      resetForm();
    } catch (error) {
      toast.error(getErrorMessage(error, 'No se pudo guardar la recompensa.'));
    } finally {
      setSaving(false);
    }
  };

  const handleActiveChange = async (reward: LoyaltyReward) => {
    try {
      const updatedReward = await updateLoyaltyReward(reward.id, { active: !reward.active });
      setRewards((current) => current.map((item) => (item.id === updatedReward.id ? updatedReward : item)));
      toast.success(updatedReward.active ? 'Recompensa activada.' : 'Recompensa desactivada.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'No se pudo actualizar la recompensa.'));
    }
  };

  const handleFulfill = async (redemption: AdminLoyaltyRedemption) => {
    if (fulfillingRedemptionId) return;
    setFulfillingRedemptionId(redemption.id);
    try {
      await fulfillLoyaltyRedemption(redemption.id, redemption.redemption_code);
      setRedemptions((current) => current.map((item) => item.id === redemption.id ? { ...item, status: 'fulfilled', fulfilled_at: new Date().toISOString() } : item));
      toast.success('Canje marcado como entregado.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'No se pudo entregar el canje.'));
    } finally {
      setFulfillingRedemptionId(null);
    }
  };

  if (loading) return <div className="py-12 text-center text-slate-500">Cargando programa de puntos...</div>;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-blue-900">Programa de puntos</h1>
          <p className="mt-2 text-lg text-slate-600">Controla el canje de alimentos y las recompensas de estudiantes.</p>
        </div>
        <div className="flex items-center gap-3 border border-blue-100 bg-white px-4 py-3 shadow-sm">
          <Star className={settings?.enabled ? 'h-5 w-5 text-amber-500' : 'h-5 w-5 text-slate-400'} />
          <div>
            <p className="text-sm font-bold text-slate-900">Programa {settings?.enabled ? 'activo' : 'inactivo'}</p>
            <p className="text-xs text-slate-500">1 punto por cada ${settings?.points_per_currency_unit.toLocaleString('es-CO') ?? '1.000'} pagados</p>
          </div>
          <Switch
            checked={settings?.enabled ?? false}
            onCheckedChange={handleEnabledChange}
            disabled={updatingSettings}
            aria-label="Activar o desactivar programa de puntos"
          />
        </div>
      </div>

      <section className="mb-8 border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{editingRewardId ? 'Editar recompensa' : 'Nueva recompensa'}</h2>
            <p className="mt-1 text-sm text-slate-600">Cada canje reserva una unidad del inventario seleccionado.</p>
          </div>
          {editingRewardId && (
            <Button type="button" variant="outline" onClick={resetForm} title="Cancelar edicion">
              <RotateCcw className="h-4 w-4" />
              Cancelar
            </Button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="reward-product">Alimento</Label>
            <select
              id="reward-product"
              value={form.productId}
              onChange={(event) => handleProductChange(event.target.value)}
              className="h-10 w-full border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="">Selecciona un alimento</option>
              {sortedProducts.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.stock} disponibles)</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reward-points">Puntos requeridos</Label>
            <Input id="reward-points" type="number" min="1" value={form.pointsRequired} onChange={(event) => setForm({ ...form, pointsRequired: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reward-title">Nombre visible</Label>
            <Input id="reward-title" value={form.title} maxLength={120} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </div>
          <div className="flex items-end justify-between border border-slate-100 px-3 py-2">
            <div>
              <Label htmlFor="reward-active">Disponible para estudiantes</Label>
              <p className="mt-1 text-xs text-slate-500">Puedes desactivarla sin borrar su historial.</p>
            </div>
            <Switch id="reward-active" checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="reward-description">Descripcion</Label>
            <Textarea id="reward-description" value={form.description} maxLength={280} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Ejemplo: Jugo natural de la cafeteria." />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button type="button" onClick={handleSave} disabled={saving} className="bg-blue-700 text-white hover:bg-blue-800">
            {editingRewardId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {saving ? 'Guardando...' : editingRewardId ? 'Guardar cambios' : 'Crear recompensa'}
          </Button>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-blue-900">Recompensas configuradas</h2>
          <span className="text-sm text-slate-500">{rewards.length} total</span>
        </div>
        {rewards.length === 0 ? (
          <div className="border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-slate-500">Crea la primera recompensa para habilitar canjes.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {rewards.map((reward) => (
              <article key={reward.id} className="flex gap-4 border border-slate-200 bg-white p-4 shadow-sm">
                {reward.product?.image_url ? <img src={reward.product.image_url} alt={reward.title} className="h-16 w-16 object-cover" /> : <div className="grid h-16 w-16 place-items-center bg-amber-50 text-amber-600"><Gift className="h-6 w-6" /></div>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="truncate font-bold text-slate-900">{reward.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">{reward.points_required} puntos - {reward.product?.name}</p>
                    </div>
                    <span className={reward.active ? 'bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700' : 'bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500'}>{reward.active ? 'Activa' : 'Inactiva'}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-500">{reward.description || 'Sin descripcion.'}</p>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button type="button" size="icon" variant="outline" onClick={() => { setEditingRewardId(reward.id); setForm(toForm(reward)); }} title="Editar recompensa" aria-label="Editar recompensa"><Pencil className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="outline" onClick={() => void handleActiveChange(reward)} title={reward.active ? 'Desactivar recompensa' : 'Activar recompensa'} aria-label={reward.active ? 'Desactivar recompensa' : 'Activar recompensa'}><Power className="h-4 w-4" /></Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-blue-900">Canjes para entregar</h2>
          <span className="text-sm text-slate-500">{redemptions.filter((redemption) => redemption.status === 'reserved').length} pendientes</span>
        </div>
        <div className="overflow-x-auto border border-slate-200 bg-white shadow-sm">
          {redemptions.length === 0 ? (
            <p className="px-6 py-10 text-center text-slate-500">Aun no hay canjes registrados.</p>
          ) : (
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Estudiante</th><th className="px-4 py-3">Recompensa</th><th className="px-4 py-3">Codigo</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {redemptions.map((redemption) => (
                  <tr key={redemption.id}>
                    <td className="px-4 py-3"><p className="font-medium text-slate-900">{redemption.user?.full_name ?? 'Estudiante'}</p><p className="text-xs text-slate-500">{redemption.user?.email}</p></td>
                    <td className="px-4 py-3">{redemption.reward?.title ?? 'Recompensa'}</td>
                    <td className="px-4 py-3 font-mono font-bold text-blue-800">{redemption.redemption_code}</td>
                    <td className="px-4 py-3"><span className={redemption.status === 'reserved' ? 'bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700' : 'bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600'}>{redemption.status === 'reserved' ? 'Pendiente' : redemption.status === 'fulfilled' ? 'Entregado' : 'Cancelado'}</span></td>
                    <td className="px-4 py-3 text-right">{redemption.status === 'reserved' && <Button type="button" size="sm" onClick={() => void handleFulfill(redemption)} disabled={fulfillingRedemptionId === redemption.id} className="bg-emerald-600 text-white hover:bg-emerald-700"><CheckCheck className="h-4 w-4" />{fulfillingRedemptionId === redemption.id ? 'Entregando...' : 'Entregar'}</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
