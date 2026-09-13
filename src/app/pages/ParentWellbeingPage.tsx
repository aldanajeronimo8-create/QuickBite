import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle2, CircleDollarSign, HeartPulse, Leaf, ShieldCheck, Utensils, WalletCards } from 'lucide-react';
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

const money = (value: number | null | undefined) => `$${Number(value ?? 0).toLocaleString('es-CO')}`;
const limitValue = (value: number | null | undefined) => value == null ? '' : String(value);

export function ParentWellbeingPage() {
  const navigate = useNavigate();
  const activeStudent = useStudentContextStore((state) => state.activeStudent);
  const [limits, setLimits] = useState<LimitRow>({ student_user_id: '', daily_limit: null, weekly_limit: null, monthly_limit: null });
  const [summary, setSummary] = useState<SpendingSummary>({ today: 0, week: 0, month: 0, orders: [] });
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [nutrition, setNutrition] = useState<NutritionRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeStudent) { navigate('/parent/family'); return; }
    setLoading(true);
    try {
      const client = requireSupabaseClient();
      const [{ data: limitData, error: limitError }, { data: summaryData, error: summaryError }, { data: productData, error: productError }, { data: nutritionData, error: nutritionError }] = await Promise.all([
        client.rpc('get_parent_spending_limit', { p_student_user_id: activeStudent.id }),
        client.rpc('get_parent_student_spending_summary', { p_student_user_id: activeStudent.id }),
        client.from('products').select('id,name,description,price,category:categories(name)').eq('available', true).order('name'),
        client.from('product_nutrition').select('*'),
      ]);
      if (limitError) throw limitError;
      if (summaryError) throw summaryError;
      if (productError) throw productError;
      if (nutritionError) throw nutritionError;
      setLimits((limitData ?? { student_user_id: activeStudent.id, daily_limit: null, weekly_limit: null, monthly_limit: null }) as LimitRow);
      setSummary((summaryData ?? { today: 0, week: 0, month: 0, orders: [] }) as SpendingSummary);
      setProducts((productData ?? []) as unknown as ProductRow[]);
      setNutrition((nutritionData ?? []) as NutritionRow[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cargar el panel de bienestar.');
    } finally { setLoading(false); }
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
      setLimits(data as LimitRow);
      toast.success('Límites de gasto actualizados.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudieron guardar los límites.'); }
    finally { setSaving(false); }
  };

  const nutritionByProduct = useMemo(() => new Map(nutrition.map((row) => [row.product_id, row])), [nutrition]);
  const featuredFoods = useMemo(() => products.filter((product) => nutritionByProduct.has(product.id)), [products, nutritionByProduct]);

  if (!activeStudent) return null;
  const dailyProgress = limits.daily_limit ? Math.min(100, (summary.today / limits.daily_limit) * 100) : 0;
  const weeklyProgress = limits.weekly_limit ? Math.min(100, (summary.week / limits.weekly_limit) * 100) : 0;
  const monthlyProgress = limits.monthly_limit ? Math.min(100, (summary.month / limits.monthly_limit) * 100) : 0;

  return (
    <div className="qb-page min-h-screen p-5 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <button type="button" onClick={() => navigate('/parent/family')} className="mt-1 rounded-full border qb-border qb-surface p-3 qb-text" aria-label="Volver a mi familia"><ArrowLeft className="h-5 w-5" /></button>
            <div><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700 dark:text-emerald-300">QuickBite Family</p><h1 className="qb-text mt-1 text-3xl font-black">Alimentación y bienestar</h1><p className="qb-text-secondary mt-1 text-sm">Control parental, gasto y características de los alimentos de {activeStudent.full_name}.</p></div>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-300/20 dark:bg-emerald-500/10 dark:text-emerald-200"><ShieldCheck className="h-5 w-5" />Protección familiar activa</div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            { label: 'Hoy', value: summary.today, limit: limits.daily_limit, progress: dailyProgress, icon: CalendarDays },
            { label: 'Esta semana', value: summary.week, limit: limits.weekly_limit, progress: weeklyProgress, icon: WalletCards },
            { label: 'Este mes', value: summary.month, limit: limits.monthly_limit, progress: monthlyProgress, icon: CircleDollarSign },
          ].map(({ label, value, limit, progress, icon: Icon }) => (
            <article key={label} className="qb-surface rounded-3xl border qb-border p-5 shadow-sm"><div className="flex items-center justify-between"><span className="qb-text-secondary text-sm font-bold">{label}</span><Icon className="h-5 w-5 text-emerald-600" /></div><p className="qb-text mt-3 text-2xl font-black">{money(value)}</p><p className="qb-text-secondary mt-1 text-xs">{limit == null ? 'Sin límite configurado' : `de ${money(limit)}`}</p>{limit != null && <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} /></div>}</article>
          ))}
        </section>

        <section className="qb-surface rounded-[2rem] border qb-border p-6 shadow-lg">
          <div className="flex items-start gap-3"><CircleDollarSign className="mt-1 h-6 w-6 text-blue-600" /><div><h2 className="qb-text text-xl font-black">Límites de gasto</h2><p className="qb-text-secondary mt-1 text-sm">Define cuánto puede gastar este estudiante. El límite se valida al crear el pedido.</p></div></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {([['daily_limit','Diario'],['weekly_limit','Semanal'],['monthly_limit','Mensual']] as const).map(([key,label]) => <label key={key} className="space-y-2"><span className="qb-text text-sm font-bold">{label}</span><Input type="number" min="0" step="500" value={limitValue(limits[key])} onChange={(e) => setLimits((current) => ({ ...current, [key]: e.target.value === '' ? null : Number(e.target.value) }))} placeholder="Sin límite" /></label>)}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="qb-text-secondary text-xs">Puedes dejar un campo vacío para no aplicar ese límite.</p><Button type="button" onClick={() => void saveLimits()} disabled={saving} className="bg-blue-600 font-black text-white hover:bg-blue-700">{saving ? 'Guardando…' : 'Guardar límites'}</Button></div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3"><Leaf className="h-6 w-6 text-emerald-600" /><div><h2 className="qb-text text-xl font-black">Información nutricional</h2><p className="qb-text-secondary text-sm">Consulta los datos que la cafetería haya registrado para cada producto.</p></div></div>
          {loading ? <div className="qb-surface rounded-3xl border qb-border p-8 text-center qb-text-secondary">Cargando información…</div> : featuredFoods.length === 0 ? <div className="qb-surface rounded-3xl border qb-border p-8 text-center"><Utensils className="mx-auto h-8 w-8 text-slate-400" /><p className="qb-text mt-2 font-bold">Aún no hay información nutricional registrada.</p><p className="qb-text-secondary mt-1 text-sm">El administrador podrá completar los datos de los productos desde el menú.</p></div> : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{featuredFoods.map((product) => { const data = nutritionByProduct.get(product.id)!; return <article key={product.id} className="qb-surface rounded-3xl border qb-border p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[.15em] text-emerald-700 dark:text-emerald-300">{product.category?.name ?? 'Alimento'}</p><h3 className="qb-text mt-1 font-black">{product.name}</h3></div>{data.healthy_choice && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">Opción saludable</span>}</div><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><span className="rounded-xl bg-slate-50 p-2 dark:bg-slate-900/60"><b>{data.calories ?? '—'}</b> kcal</span><span className="rounded-xl bg-slate-50 p-2 dark:bg-slate-900/60"><b>{data.protein_g ?? '—'} g</b> proteína</span><span className="rounded-xl bg-slate-50 p-2 dark:bg-slate-900/60"><b>{data.carbohydrates_g ?? '—'} g</b> carbohidratos</span><span className="rounded-xl bg-slate-50 p-2 dark:bg-slate-900/60"><b>{data.fat_g ?? '—'} g</b> grasa</span></div>{data.ingredients && <p className="qb-text-secondary mt-3 text-xs"><b className="qb-text">Ingredientes:</b> {data.ingredients}</p>}{data.allergens && <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300"><b>Alérgenos:</b> {data.allergens}</p>}{data.vegetarian && <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Vegetariano</p>}</article>; })}</div>}
        </section>

        <section className="qb-surface rounded-[2rem] border qb-border p-6 shadow-lg"><div className="flex items-center gap-3"><HeartPulse className="h-5 w-5 text-rose-500" /><h2 className="qb-text text-xl font-black">Últimos pedidos</h2></div>{summary.orders.length === 0 ? <p className="qb-text-secondary mt-4 text-sm">Todavía no hay pedidos registrados para este estudiante.</p> : <div className="mt-4 divide-y qb-border">{summary.orders.map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="qb-text font-bold">Pedido #{order.order_number}</p><p className="qb-text-secondary text-xs">{new Date(order.created_at).toLocaleString('es-CO')}</p></div><div className="text-right"><p className="qb-text font-black">{money(order.total)}</p><p className="text-xs font-bold text-emerald-600">{order.status}</p></div></div>)}</div>}</section>
      </div>
    </div>
  );
}
