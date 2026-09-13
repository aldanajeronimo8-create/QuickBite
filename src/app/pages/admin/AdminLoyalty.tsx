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
import { useAuthStore } from '../../../store/authStore';
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
  const authLoading = useAuthStore((state) => state.loading);
  const currentUser = useAuthStore((state) => state.user);
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
    if (!currentUser || authLoading) return;
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
  }, [authLoading, currentUser]);

  useEffect(() => {
    if (authLoading || !currentUser) return;
    void load();
  }, [authLoading, currentUser, load]);

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
        if (!editingRewardId) return [...current, savedReward];
        return current.map((reward) => (reward.id === editingRewardId ? savedReward : reward));
      });
      toast.success(editingRewardId ? 'Recompensa actualizada.' : 'Recompensa creada.');
      resetForm();
    } catch (error) {
      toast.error(getErrorMessage(error, 'No se pudo guardar la recompensa.'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (reward: LoyaltyReward) => {
    setEditingRewardId(reward.id);
    setForm(toForm(reward));
  };

  const handleToggleReward = async (reward: LoyaltyReward) => {
    const nextActive = !reward.active;
    try {
      const updated = await updateLoyaltyReward(reward.id, { active: nextActive });
      setRewards((current) => current.map((item) => (item.id === reward.id ? updated : item)));
      toast.success(nextActive ? 'Recompensa activada.' : 'Recompensa desactivada.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'No se pudo cambiar el estado de la recompensa.'));
    }
  };

  const handleFulfill = async (redemptionId: string, redemptionCode: string) => {
    setFulfillingRedemptionId(redemptionId);
    try {
      await fulfillLoyaltyRedemption(redemptionId, redemptionCode);
      setRedemptions((current) => current.map((redemption) => redemption.id === redemptionId ? { ...redemption, status: 'fulfilled' } : redemption));
      toast.success('Canje marcado como entregado.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'No se pudo entregar el canje.'));
    } finally {
      setFulfillingRedemptionId(null);
    }
  };

  if (loading) {
    return <div className="flex min-h-[300px] items-center justify-center text-sm text-slate-500">Cargando programa de puntos…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Fidelidad</h1>
        <p className="mt-1 text-sm text-slate-500">Administra el programa de puntos, recompensas y entregas.</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black text-slate-900">Programa de puntos</p>
            <p className="mt-1 text-sm text-slate-500">Activa o desactiva el programa para los usuarios.</p>
          </div>
          <Switch checked={Boolean(settings?.enabled)} onCheckedChange={handleEnabledChange} disabled={updatingSettings} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-slate-900">Recompensas</p>
            <p className="mt-1 text-sm text-slate-500">Vincula una recompensa con un alimento y una cantidad de puntos.</p>
          </div>
          {editingRewardId && <Button variant="outline" size="sm" onClick={resetForm}><RotateCcw className="mr-1 h-4 w-4" />Cancelar edición</Button>}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <div><Label>Alimento</Label><select value={form.productId} onChange={(e) => handleProductChange(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"><option value="">Selecciona un alimento</option>{sortedProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></div>
            <div><Label>Título</Label><Input value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} /></div>
            <div><Label>Descripción</Label><Textarea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} /></div>
            <div><Label>Puntos requeridos</Label><Input inputMode="numeric" value={form.pointsRequired} onChange={(e) => setForm((current) => ({ ...current, pointsRequired: e.target.value }))} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={(active) => setForm((current) => ({ ...current, active }))} /><span className="text-sm text-slate-700">Recompensa activa</span></div>
            <Button onClick={() => void handleSave()} disabled={saving}><Save className="mr-1 h-4 w-4" />{saving ? 'Guardando…' : editingRewardId ? 'Guardar cambios' : 'Crear recompensa'}</Button>
          </div>

          <div className="space-y-2">
            {rewards.length === 0 ? <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Todavía no hay recompensas.</div> : rewards.map((reward) => <div key={reward.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"><div className="min-w-0"><p className="truncate font-black text-slate-900">{reward.title}</p><p className="mt-1 text-xs text-slate-500">{reward.points_required} puntos · {reward.product?.name ?? 'Sin alimento'}</p></div><div className="flex shrink-0 gap-2"><Button variant="outline" size="sm" onClick={() => handleEdit(reward)}><Pencil className="h-4 w-4" /></Button><Button variant="outline" size="sm" onClick={() => void handleToggleReward(reward)}>{reward.active ? <Power className="h-4 w-4" /> : <Plus className="h-4 w-4" />}</Button></div></div>)}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4"><p className="text-sm font-black text-slate-900">Canjes</p><p className="mt-1 text-sm text-slate-500">Revisa los canjes y confirma su entrega en cafetería.</p></div>
        <div className="space-y-3">{redemptions.length === 0 ? <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Todavía no hay canjes.</div> : redemptions.map((redemption) => <div key={redemption.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"><div><p className="font-black text-slate-900">{redemption.reward?.title ?? 'Recompensa'}</p><p className="mt-1 text-xs text-slate-500">{redemption.user?.full_name ?? redemption.user?.email ?? 'Usuario'} · {redemption.points_spent} puntos · código {redemption.redemption_code}</p></div><Button size="sm" disabled={redemption.status === 'fulfilled' || fulfillingRedemptionId === redemption.id} onClick={() => void handleFulfill(redemption.id, redemption.redemption_code)}>{fulfillingRedemptionId === redemption.id ? 'Entregando…' : redemption.status === 'fulfilled' ? <><CheckCheck className="mr-1 h-4 w-4" />Entregado</> : <><Gift className="mr-1 h-4 w-4" />Marcar entregado</>}</Button></div>)}</div>
      </section>
    </div>
  );
}
