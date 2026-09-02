import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCheck, Gift, Pencil, Plus, Power, RotateCcw, Save, Star } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '../../../lib/errorMessage';
import type { AdminLoyaltyRedemption, LoyaltyReward, LoyaltySettings } from '../../../lib/supabase';
import { createLoyaltyReward, fulfillLoyaltyRedemption, getLoyaltySettings, listAdminLoyaltyRedemptions, listLoyaltyRewards, updateLoyaltyReward, updateLoyaltySettings } from '../../../repositories/quickbiteRepository';
import { useDataStore } from '../../../store/dataStore';
import { useAuthStore } from '../../../store/authStore';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';

type RewardForm = { productId: string; title: string; description: string; pointsRequired: string; active: boolean };
const emptyForm: RewardForm = { productId: '', title: '', description: '', pointsRequired: '', active: true };
function toForm(reward: LoyaltyReward): RewardForm { return { productId: reward.product_id, title: reward.title, description: reward.description ?? '', pointsRequired: String(reward.points_required), active: reward.active }; }

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

  const sortedProducts = useMemo(() => [...products].sort((left, right) => left.name.localeCompare(right.name)), [products]);

  const load = useCallback(async () => {
    if (!currentUser || authLoading) return;
    setLoading(true);
    try {
      const [nextSettings, nextRewards, nextRedemptions] = await Promise.all([getLoyaltySettings(), listLoyaltyRewards(true), listAdminLoyaltyRedemptions()]);
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
  }, [authLoading, currentUser?.id, load]);

  const resetForm = () => { setEditingRewardId(null); setForm(emptyForm); };
  const handleEnabledChange = async (enabled: boolean) => {
    if (!settings || updatingSettings) return;
    const previousSettings = settings;
    setUpdatingSettings(true); setSettings({ ...settings, enabled });
    try { const savedSettings = await updateLoyaltySettings({ enabled }); setSettings(savedSettings); toast.success(enabled ? 'Programa de puntos activado.' : 'Programa de puntos desactivado.'); }
    catch (error) { setSettings(previousSettings); toast.error(getErrorMessage(error, 'No se pudo actualizar el programa de puntos.')); }
    finally { setUpdatingSettings(false); }
  };
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.productId || !form.title.trim()) { toast.error('Selecciona un producto e ingresa un título.'); return; }
    const points = Number.parseInt(form.pointsRequired, 10);
    if (!Number.isInteger(points) || points <= 0) { toast.error('Los puntos requeridos deben ser un número mayor que 0.'); return; }
    setSaving(true);
    try {
      if (editingRewardId) await updateLoyaltyReward(editingRewardId, { product_id: form.productId, title: form.title.trim(), description: form.description.trim() || null, points_required: points, active: form.active });
      else await createLoyaltyReward({ product_id: form.productId, title: form.title.trim(), description: form.description.trim() || null, points_required: points, active: form.active });
      toast.success(editingRewardId ? 'Recompensa actualizada.' : 'Recompensa creada.'); resetForm(); await load();
    } catch (error) { toast.error(getErrorMessage(error, 'No se pudo guardar la recompensa.')); }
    finally { setSaving(false); }
  };
  const startEdit = (reward: LoyaltyReward) => { setEditingRewardId(reward.id); setForm(toForm(reward)); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const fulfill = async (redemption: AdminLoyaltyRedemption) => {
    const code = window.prompt('Código de entrega:'); if (!code?.trim()) return;
    setFulfillingRedemptionId(redemption.id);
    try { await fulfillLoyaltyRedemption(redemption.id, code.trim()); toast.success('Canje marcado como entregado.'); await load(); }
    catch (error) { toast.error(getErrorMessage(error, 'No se pudo entregar el canje.')); }
    finally { setFulfillingRedemptionId(null); }
  };

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-amber-600"><Star className="h-4 w-4" />Beneficios</p><h1 className="text-3xl font-black text-slate-900">Puntos y recompensas</h1><p className="mt-1 text-sm text-slate-600">Configura el programa, administra recompensas y controla los canjes.</p></div>{settings && <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm"><Power className="h-5 w-5 text-amber-600" /><div><p className="text-sm font-black">Programa activo</p><p className="text-xs text-slate-500">Control general de puntos</p></div><Switch checked={settings.enabled} disabled={updatingSettings} onCheckedChange={handleEnabledChange} /></div>}</div>
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-xl font-black text-slate-900">{editingRewardId ? 'Editar recompensa' : 'Nueva recompensa'}</h2><p className="text-sm text-slate-500">Asocia un producto y define cuántos puntos necesita el estudiante.</p></div>{editingRewardId && <Button type="button" variant="outline" onClick={resetForm}><RotateCcw className="mr-2 h-4 w-4" />Cancelar edición</Button>}</div><form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2"><div><Label>Producto</Label><select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Selecciona un producto</option>{sortedProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></div><div><Label>Puntos requeridos</Label><Input type="number" min="1" value={form.pointsRequired} onChange={(e) => setForm({ ...form, pointsRequired: e.target.value })} /></div><div className="md:col-span-2"><Label>Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ej. Snack gratis" /></div><div className="md:col-span-2"><Label>Descripción</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe la recompensa" rows={3} /></div><div className="flex items-center gap-3"><Switch checked={form.active} onCheckedChange={(checked) => setForm({ ...form, active: checked })} /><span className="text-sm font-semibold">Recompensa activa</span></div><div className="flex justify-end md:col-span-2"><Button type="submit" disabled={saving} className="bg-blue-700 text-white hover:bg-blue-800"><Save className="mr-2 h-4 w-4" />{saving ? 'Guardando...' : editingRewardId ? 'Guardar cambios' : 'Crear recompensa'}</Button></div></form></section>
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><div className="flex items-center gap-3"><Gift className="h-6 w-6 text-amber-600" /><div><h2 className="text-xl font-black">Recompensas</h2><p className="text-sm text-slate-500">{loading ? 'Cargando…' : `${rewards.length} recompensas configuradas.`}</p></div></div></div><div className="divide-y divide-slate-100">{rewards.map((reward) => <div key={reward.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-slate-900">{reward.title}</p><p className="text-sm text-slate-500">{reward.product?.name ?? 'Producto no disponible'} · {reward.points_required} puntos · {reward.active ? 'Activa' : 'Inactiva'}</p></div><Button variant="outline" onClick={() => startEdit(reward)}><Pencil className="mr-2 h-4 w-4" />Editar</Button></div>)}{!loading && rewards.length === 0 && <div className="p-8 text-center text-slate-500">No hay recompensas configuradas.</div>}</div></section>
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><div className="flex items-center gap-3"><CheckCheck className="h-6 w-6 text-emerald-600" /><div><h2 className="text-xl font-black">Canjes</h2><p className="text-sm text-slate-500">Consulta y entrega los canjes registrados.</p></div></div></div><div className="divide-y divide-slate-100">{redemptions.map((redemption) => <div key={redemption.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-black">{redemption.user?.full_name ?? 'Usuario'}</p><p className="text-sm text-slate-500">{redemption.reward?.title ?? 'Recompensa'} · {redemption.points_spent} puntos · Estado: {redemption.status}</p><p className="mt-1 text-xs text-slate-400">Código: {redemption.redemption_code}</p></div>{redemption.status === 'approved' && <Button disabled={fulfillingRedemptionId === redemption.id} onClick={() => void fulfill(redemption)} className="bg-emerald-600 text-white hover:bg-emerald-700">{fulfillingRedemptionId === redemption.id ? 'Validando...' : 'Marcar entregado'}</Button>}</div>)}{!loading && redemptions.length === 0 && <div className="p-8 text-center text-slate-500">No hay canjes registrados.</div>}</div></section>
  </div>;
}