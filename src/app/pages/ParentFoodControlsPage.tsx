import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Leaf, Lock, Search, ShieldCheck, Unlock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { requireSupabaseClient } from '../../lib/supabase';
import { useStudentContextStore } from '../../store/studentContextStore';
import { Button } from '../components/ui/button';

interface FoodControl {
  product_id: string;
  product_name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category_id: string | null;
  category_name: string | null;
  blocked: boolean;
  reason: string | null;
}

export function ParentFoodControlsPage() {
  const navigate = useNavigate();
  const activeStudent = useStudentContextStore((state) => state.activeStudent);
  const [foods, setFoods] = useState<FoodControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!activeStudent) {
      navigate('/parent/family');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await requireSupabaseClient().rpc('get_parent_food_controls', {
        p_student_user_id: activeStudent.id,
      });
      if (error) throw error;
      setFoods((data ?? []) as FoodControl[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar los alimentos.');
    } finally {
      setLoading(false);
    }
  }, [activeStudent, navigate]);

  useEffect(() => { void load(); }, [load]);

  const filteredFoods = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return foods;
    return foods.filter((food) => `${food.product_name} ${food.description ?? ''} ${food.category_name ?? ''}`.toLowerCase().includes(normalized));
  }, [foods, query]);

  const toggle = async (food: FoodControl) => {
    if (!activeStudent || savingId) return;
    setSavingId(food.product_id);
    try {
      const { data, error } = await requireSupabaseClient().rpc('set_parent_food_block', {
        p_student_user_id: activeStudent.id,
        p_product_id: food.product_id,
        p_blocked: !food.blocked,
        p_reason: food.reason ?? null,
      });
      if (error) throw error;
      setFoods((current) => current.map((item) => item.product_id === food.product_id ? { ...item, blocked: data } : item));
      toast.success(data ? `${food.product_name} quedó bloqueado para ${activeStudent.full_name}.` : `${food.product_name} volvió a estar permitido.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar la restricción.');
    } finally {
      setSavingId(null);
    }
  };

  if (!activeStudent) return null;

  const blockedCount = foods.filter((food) => food.blocked).length;

  return (
    <div className="qb-page min-h-screen p-5 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <button type="button" onClick={() => navigate('/parent/family')} className="mt-1 rounded-full border qb-border qb-surface p-3 qb-text" aria-label="Volver a mi familia">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700 dark:text-emerald-300">Alimentación y bienestar</p>
              <h1 className="qb-text mt-1 text-3xl font-black">Control de alimentos</h1>
              <p className="qb-text-secondary mt-1 text-sm">Gestiona qué productos puede comprar {activeStudent.full_name} en QuickBite.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-300/20 dark:bg-emerald-500/10 dark:text-emerald-200">
            <ShieldCheck className="h-5 w-5" />
            {blockedCount} bloqueado{blockedCount === 1 ? '' : 's'}
          </div>
        </header>

        <section className="qb-surface rounded-[2rem] border qb-border p-5 shadow-lg">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-2xl border qb-border bg-slate-50 px-4 py-3 dark:bg-slate-900/60">
              <Search className="h-4 w-4 qb-text-secondary" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none qb-text" placeholder="Buscar alimento o categoría…" />
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold qb-text-secondary"><Leaf className="h-4 w-4 text-emerald-600" />Las restricciones se aplican también al realizar el pedido.</div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? <div className="qb-surface col-span-full rounded-3xl border qb-border p-8 text-center qb-text-secondary">Cargando alimentos…</div> : filteredFoods.length === 0 ? <div className="qb-surface col-span-full rounded-3xl border qb-border p-8 text-center qb-text-secondary">No encontramos alimentos con esa búsqueda.</div> : filteredFoods.map((food) => (
            <article key={food.product_id} className={`qb-surface rounded-3xl border p-4 shadow-sm transition ${food.blocked ? 'border-rose-300 bg-rose-50/50 dark:border-rose-300/25 dark:bg-rose-500/10' : 'qb-border'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[.16em] text-emerald-700 dark:text-emerald-300">{food.category_name ?? 'Alimento'}</p>
                  <h2 className="qb-text mt-1 font-black">{food.product_name}</h2>
                  {food.description && <p className="qb-text-secondary mt-1 line-clamp-2 text-xs">{food.description}</p>}
                </div>
                {food.blocked ? <Lock className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-300" /> : <Unlock className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" />}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="qb-text text-sm font-black">${Number(food.price).toLocaleString('es-CO')}</span>
                <Button type="button" onClick={() => void toggle(food)} disabled={savingId === food.product_id} className={food.blocked ? 'bg-emerald-600 font-black text-white hover:bg-emerald-700' : 'bg-rose-600 font-black text-white hover:bg-rose-700'}>
                  {savingId === food.product_id ? 'Guardando…' : food.blocked ? <><Unlock className="mr-2 h-4 w-4" />Permitir</> : <><Lock className="mr-2 h-4 w-4" />Bloquear</>}
                </Button>
              </div>
              {food.blocked && <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-200"><Check className="h-3.5 w-3.5" />No aparecerá como comprable para este estudiante.</p>}
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
