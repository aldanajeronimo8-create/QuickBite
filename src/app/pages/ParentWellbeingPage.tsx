import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Award, Bell, CalendarDays, CheckCircle2, CircleDollarSign, Heart, HeartPulse, Leaf, ShieldCheck, Trophy, Utensils, WalletCards } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { requireSupabaseClient } from '../../lib/supabase';
import { useStudentContextStore } from '../../store/studentContextStore';

interface LimitRow { student_user_id: string; daily_limit: number | null; weekly_limit: number | null; monthly_limit: number | null; }
interface NutritionRow { product_id: string; calories: number | null; protein_g: number | null; carbohydrates_g: number | null; fat_g: number | null; fiber_g: number | null; ingredients: string | null; allergens: string | null; vegetarian: boolean; healthy_choice: boolean; }
interface ProductRow { id: string; name: string; description?: string | null; price: number; category?: { name?: string | null } | null; }
interface SpendingSummary { today: number; week: number; month: number; orders: Array<{ id: string; order_number: string; total: number; status: string; created_at: string }>; }
interface FamilyDashboard {
  student_user_id: string;
  today_spent: number;
  month_spent: number;
  today_orders: number;
  month_orders: number;
  today_calories: number;
  today_protein_g: number;
  today_fiber_g: number;
  points: number;
  favorites: number;
  unread_alerts: number;
  blocked_foods: number;
  daily_limit: number | null;
  weekly_limit: number | null;
  monthly_limit: number | null;
  updated_at: string;
}

const money = (value: number | null | undefined) => `$${Number(value ?? 0).toLocaleString('es-CO')}`;
const limitValue = (value: number | null | undefined) => value == null ? '' : String(value);
const percentage = (value: number, limit: number | null) => limit && limit > 0 ? Math.min(100, (value / limit) * 100) : 0;

const statusLabel: Record<string, string> = {
  pending: 'Pendiente', preparing: 'En preparación', ready: 'Listo para recoger', delivered: 'Entregado', cancelled: 'Cancelado', rejected: 'Rechazado',
};

export function ParentWellbeingPage() {
  const navigate = useNavigate();
  const activeStudent = useStudentContextStore((state) => state.activeStudent);
  const [limits, setLimits] = useState<LimitRow>({ student_user_id: '', daily_limit: null, weekly_limit: null, monthly_limit: null });
  const [summary, setSummary] = useState<SpendingSummary>({ today: 0, week: 0, month: 0, orders: [] });
  const [dashboard, setDashboard] = useState<FamilyDashboard | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [nutrition, setNutrition] = useState<NutritionRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeStudent) { navigate('/parent/family'); return; }
    setLoading(true);
    setDashboardLoading(true);
    try {
      const client = requireSupabaseClient();
      const [
        { data: dashboardData, error: dashboardError },
        { data: limitData, error: limitError },
        { data: summaryData, error: summaryError },
        { data: productData, error: productError },
        { data: nutritionData, error: nutritionError },
      ] = await Promise.all([
        client.rpc('get_parent_family_dashboard', { p_student_user_id: activeStudent.id }),
        client.rpc('get_parent_spending_limit', { p_student_user_id: activeStudent.id }),
        client.rpc('get_parent_student_spending_summary', { p_student_user_id: activeStudent.id }),
        client.from('products').select('id,name,description,price,category:categories(name)').eq('available', true).order('name'),
        client.from('product_nutrition').select('*'),
      ]);
      if (dashboardError) throw dashboardError;
      if (limitError) throw limitError;
      if (summaryError) throw summaryError;
      if (productError) throw productError;
      if (nutritionError) throw nutritionError;
      setDashboard((dashboardData ?? null) as FamilyDashboard | null);
      setLimits((limitData ?? { student_user_id: activeStudent.id, daily_limit: null, weekly_limit: null, monthly_limit: null }) as LimitRow);
      setSummary((summaryData ?? { today: 0, week: 0, month: 0, orders: [] }) as SpendingSummary);
      setProducts((productData ?? []) as unknown as ProductRow[]);
      setNutrition((nutritionData ?? []) as NutritionRow[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cargar el panel de bienestar.');
    } finally {
      setLoading(false);
      setDashboardLoading(false);
    }
  }, [activeStudent, navigate]);

  useEffect(() => { void load(); }, [load]);

  const saveLimits = async () => {
    if (!activeStudent || saving) return;
    const daily = limits.daily_limit == null ? null : Number(limits.daily_limit);
    const weekly = limits.weekly_limit == null ? null : Number(limits.weekly_limit);
    const monthly = limits.monthly_limit == null ? null : Number(limits.monthly_limit);
    if ([daily, weekly, monthly].some((value) => value !== null && (!Number.isFinite(value) || value < 0))) return toast.error('Los límites deben ser números mayores o iguales a 0.');
    setSaving(true);
    try {
      const { data, error } = await requireSupabaseClient().rpc('set_parent_spending_limits', { p_student_user_id: activeStudent.id, p_daily_limit: daily, p_weekly_limit: weekly, p_monthly_limit: monthly });
      if (error) throw error;
      const updatedLimits = data as LimitRow;
      setLimits(updatedLimits);
      if (dashboard) setDashboard({ ...dashboard, daily_limit: updatedLimits.daily_limit, weekly_limit: updatedLimits.weekly_limit, monthly_limit: updatedLimits.monthly_limit });
      toast.success('Límites de gasto actualizados.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudieron guardar los límites.'); }
    finally { setSaving(false); }
  };

  const nutritionByProduct = useMemo(() => new Map(nutrition.map((row) => [row.product_id, row])), [nutrition]);
  const featuredFoods = useMemo(() => products.filter((product) => nutritionByProduct.has(product.id)), [products, nutritionByProduct]);

  if (!activeStudent) return null;

  const dailySpent = dashboard?.today_spent ?? summary.today;
  const weeklySpent = summary.week;
  const monthlySpent = dashboard?.month_spent ?? summary.month;
  const dailyLimit = dashboard?.daily_limit ?? limits.daily_limit;
  const weeklyLimit = dashboard?.weekly_limit ?? limits.weekly_limit;
  const monthlyLimit = dashboard?.monthly_limit ?? limits.monthly_limit;

  return (
    <div className="qb-page min-h-screen p-5 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <button type="button" onClick={() => navigate('/parent/family')} className="mt-1 rounded-full border qb-border qb-surface p-3 qb-text" aria-label="Volver a mi familia"><ArrowLeft className="h-5 w-5" /></button>
            <div><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700 dark:text-emerald-300">QuickBite Family</p><h1 className="qb-text mt-1 text-3xl font-black">Bienestar de {activeStudent.full_name}</h1><p className="qb-text-secondary mt-1 text-sm">Resumen de consumo, límites y actividad reciente del estudiante.</p></div>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-300/20 dark:bg-emerald-500/10 dark:text-emerald-200"><ShieldCheck className="h-5 w-5" />Protección familiar activa</div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="qb-surface rounded-3xl border qb-border p-5 shadow-sm"><div className="flex items-center justify-between"><span className="qb-text-secondary text-sm font-bold">Gasto hoy</span><CircleDollarSign className="h-5 w-5 text-emerald-600" /></div><p className="qb-text mt-3 text-2xl font-black">{money(dailySpent)}</p><p className="qb-text-secondary mt-1 text-xs">{dailyLimit == null ? 'Sin límite diario' : `de ${money(dailyLimit)}`}</p>{dailyLimit != null && <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${percentage(dailySpent, dailyLimit)}%` }} /></div>}</article>
          <article className="qb-surface rounded-3xl border qb-border p-5 shadow-sm"><div className="flex items-center justify-between"><span className="qb-text-secondary text-sm font-bold">Pedidos hoy</span><WalletCards className="h-5 w-5 text-blue-600" /></div><p className="qb-text mt-3 text-2xl font-black">{dashboardLoading ? '—' : dashboard?.today_orders ?? summary.orders.filter((order) => new Date(order.created_at).toDateString() === new Date().toDateString()).length}</p><p className="qb-text-secondary mt-1 text-xs">Actividad confirmada del día</p></article>
          <article className="qb-surface rounded-3xl border qb-border p-5 shadow-sm"><div className="flex items-center justify-between"><span className="qb-text-secondary text-sm font-bold">Puntos</span><Trophy className="h-5 w-5 text-amber-500" /></div><p className="qb-text mt-3 text-2xl font-black">{dashboardLoading ? '—' : dashboard?.points ?? 0}</p><p className="qb-text-secondary mt-1 text-xs">Saldo actual de recompensas</p></article>
          <article className="qb-surface rounded-3xl border qb-border p-5 shadow-sm"><div className="flex items-center justify-between"><span className="qb-text-secondary text-sm font-bold">Favoritos</span><Heart className="h-5 w-5 text-rose-500" /></div><p className="qb-text mt-3 text-2xl font-black">{dashboardLoading ? '—' : dashboard?.favorites ?? 0}</p><p className="qb-text-secondary mt-1 text-xs">Productos guardados</p></article>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-3xl border border-amber-200 bg-amber-50/80 p-5 dark:border-amber-300/15 dark:bg-amber-500/10"><div className="flex items-center gap-2 text-amber-800 dark:text-amber-200"><Bell className="h-5 w-5"/><span className="text-sm font-black">Alertas</span></div><p className="mt-2 text-2xl font-black text-amber-900 dark:text-amber-100">{dashboardLoading ? '—' : dashboard?.unread_alerts ?? 0}</p><p className="mt-1 text-xs text-amber-900/70 dark:text-amber-100/70">Notificaciones pendientes</p></article>
          <article className="rounded-3xl border border-rose-200 bg-rose-50/80 p-5 dark:border-rose-300/15 dark:bg-rose-500/10"><div className="flex items-center gap-2 text-rose-800 dark:text-rose-200"><ShieldCheck className="h-5 w-5"/><span className="text-sm font-black">Restricciones</span></div><p className="mt-2 text-2xl font-black text-rose-900 dark:text-rose-100">{dashboardLoading ? '—' : dashboard?.blocked_foods ?? 0}</p><p className="mt-1 text-xs text-rose-900/70 dark:text-rose-100/70">Alimentos bloqueados</p></article>
          <article className="qb-surface rounded-3xl border qb-border p-5 shadow-sm"><div className="flex items-center gap-2"><Award className="h-5 w-5 text-blue-600"/><span className="qb-text font-black">Pedidos del mes</span></div><p className="qb-text mt-2 text-2xl font-black">{dashboardLoading ? '—' : dashboard?.month_orders ?? summary.orders.length}</p><p className="qb-text-secondary mt-1 text-xs">Pedidos registrados en el mes</p></article>
          <article className="qb-surface rounded-3xl border qb-border p-5 shadow-sm"><div className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-blue-600"/><span className="qb-text font-black">Gasto del mes</span></div><p className="qb-text mt-2 text-2xl font-black">{money(monthlySpent)}</p><p className="qb-text-secondary mt-1 text-xs">Total de compras confirmadas</p></article>
        </section>

        <section className="qb-surface rounded-[2rem] border qb-border p-6 shadow-lg">
          <div className="flex items-start gap-3"><HeartPulse className="mt-1 h-6 w-6 text-rose-500"/><div><h2 className="qb-text text-xl font-black">Bienestar de hoy</h2><p className="qb-text-secondary mt-1 text-sm">Resumen nutricional de los pedidos confirmados del día. Solo muestra datos registrados por la cafetería.</p></div></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <article className="rounded-2xl bg-[var(--qb-surface-muted)] p-5"><p className="qb-text-secondary text-xs font-bold uppercase tracking-wide">Energía</p><p className="qb-text mt-2 text-2xl font-black">{dashboardLoading ? '—' : `${Math.round(dashboard?.today_calories ?? 0)} kcal`}</p></article>
            <article className="rounded-2xl bg-[var(--qb-surface-muted)] p-5"><p className="qb-text-secondary text-xs font-bold uppercase tracking-wide">Proteína</p><p className="qb-text mt-2 text-2xl font-black">{dashboardLoading ? '—' : `${Number(dashboard?.today_protein_g ?? 0).toFixed(1)} g`}</p></article>
            <article className="rounded-2xl bg-[var(--qb-surface-muted)] p-5"><p className="qb-text-secondary text-xs font-bold uppercase tracking-wide">Fibra</p><p className="qb-text mt-2 text-2xl font-black">{dashboardLoading ? '—' : `${Number(dashboard?.today_fiber_g ?? 0).toFixed(1)} g`}</p></article>
          </div>
        </section>

        <section className="qb-surface rounded-[2rem] border qb-border p-6 shadow-lg"><div className="flex items-start gap-3"><WalletCards className="mt-1 h-6 w-6 text-blue-600"/><div><h2 className="qb-text text-xl font-black">Control de gasto</h2><p className="qb-text-secondary mt-1 text-sm">Consulta el consumo frente a los límites configurados para el estudiante.</p></div></div><div className="mt-5 grid gap-4 md:grid-cols-3">{[['Diario', dailySpent, dailyLimit], ['Semanal', weeklySpent, weeklyLimit], ['Mensual', monthlySpent, monthlyLimit]].map(([label, value, limit]) => { const numericValue = Number(value ?? 0); const numericLimit = limit == null ? null : Number(limit); return <article key={String(label)} className="rounded-2xl bg-[var(--qb-surface-muted)] p-4"><div className="flex items-center justify-between"><span className="qb-text font-bold">{label}</span><span className="qb-text-secondary text-xs">{numericLimit == null ? 'Sin límite' : money(numericLimit)}</span></div><p className="qb-text mt-2 text-lg font-black">{money(numericValue)}</p>{numericLimit != null && <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full rounded-full bg-blue-500" style={{ width: `${percentage(numericValue, numericLimit)}%` }} /></div>}</article>; })}</div><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="qb-text-secondary text-xs">Los límites configurados se mantienen vigentes al registrar nuevos pedidos.</p><Button type="button" onClick={() => document.getElementById('spending-limits')?.scrollIntoView({ behavior: 'smooth' })} variant="outline">Administrar límites</Button></div></section>

        <section id="spending-limits" className="qb-surface rounded-[2rem] border qb-border p-6 shadow-lg"><div className="flex items-start gap-3"><CircleDollarSign className="mt-1 h-6 w-6 text-blue-600"/><div><h2 className="qb-text text-xl font-black">Límites de gasto</h2><p className="qb-text-secondary mt-1 text-sm">Define cuánto puede gastar este estudiante. El límite se valida al crear el pedido.</p></div></div><div className="mt-5 grid gap-4 sm:grid-cols-3">{([['daily_limit','Diario'],['weekly_limit','Semanal'],['monthly_limit','Mensual']] as const).map(([key,label]) => <label key={key} className="space-y-2"><span className="qb-text text-sm font-bold qb-text">{label}</span><Input type="number" min="0" step="500" value={limitValue(limits[key])} onChange={(e) => setLimits((current) => ({ ...current, [key]: e.target.value === '' ? null : Number(e.target.value) }))} placeholder="Sin límite" /></label>)}</div><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="qb-text-secondary text-xs">Puedes dejar un campo vacío para no aplicar ese límite.</p><Button type="button" onClick={() => void saveLimits()} disabled={saving} className="bg-blue-600 font-black text-white hover:bg-blue-700">{saving ? 'Guardando…' : 'Guardar límites'}</Button></div></section>

        <section className="space-y-4"><div className="flex items-center gap-3"><Leaf className="h-6 w-6 text-emerald-600"/><div><h2 className="qb-text text-xl font-black">Información nutricional</h2><p className="qb-text-secondary text-sm">Consulta los datos que la cafetería haya registrado para cada producto.</p></div></div>{loading ? <div className="qb-surface rounded-3xl border qb-border p-8 text-center qb-text-secondary">Cargando información…</div> : featuredFoods.length === 0 ? <div className="qb-surface rounded-3xl border qb-border p-8 text-center"><Utensils className="mx-auto h-8 w-8 text-slate-400"/><p className="qb-text mt-2 font-bold">Aún no hay información nutricional registrada.</p><p className="qb-text-secondary mt-1 text-sm">El administrador podrá completar los datos de los productos desde el menú.</p></div> : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{featuredFoods.map((product) => { const data = nutritionByProduct.get(product.id)!; return <article key={product.id} className="qb-surface rounded-3xl border qb-border p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[.15em] text-emerald-700 dark:text-emerald-300">{product.category?.name ?? 'Alimento'}</p><h3 className="qb-text mt-1 font-black">{product.name}</h3></div>{data.healthy_choice && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">Opción saludable</span>}</div><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><span className="rounded-xl bg-slate-50 p-2 dark:bg-slate-900/60"><b>{data.calories ?? '—'}</b> kcal</span><span className="rounded-xl bg-slate-50 p-2 dark:bg-slate-900/60"><b>{data.protein_g ?? '—'} g</b> proteína</span><span className="rounded-xl bg-slate-50 p-2 dark:bg-slate-900/60"><b>{data.carbohydrates_g ?? '—'} g</b> carbohidratos</span><span className="rounded-xl bg-slate-50 p-2 dark:bg-slate-900/60"><b>{data.fat_g ?? '—'} g</b> grasa</span></div>{data.ingredients && <p className="qb-text-secondary mt-3 text-xs"><b className="qb-text">Ingredientes:</b> {data.ingredients}</p>}{data.allergens && <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300"><b>Alérgenos:</b> {data.allergens}</p>}{data.vegetarian && <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5"/>Vegetariano</p>}</article>; })}</div>}</section>

        <section className="qb-surface rounded-[2rem] border qb-border p-6 shadow-lg"><div className="flex items-center gap-3"><HeartPulse className="h-5 w-5 text-rose-500"/><h2 className="qb-text text-xl font-black">Últimos pedidos</h2></div>{summary.orders.length === 0 ? <p className="qb-text-secondary mt-4 text-sm">Todavía no hay pedidos registrados para este estudiante.</p> : <div className="mt-4 divide-y qb-border">{summary.orders.map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="qb-text font-bold">Pedido #{order.order_number}</p><p className="qb-text-secondary text-xs">{new Date(order.created_at).toLocaleString('es-CO')}</p></div><div className="text-right"><p className="qb-text font-black">{money(order.total)}</p><p className="text-xs font-bold text-emerald-600 dark:text-emerald-300">{statusLabel[order.status] ?? order.status}</p></div></div>)}</div>}</section>
      </div>
    </div>
  );
}
