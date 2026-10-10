import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, Info, Leaf, Lock, Plus, Search, ShieldCheck, Unlock, Utensils, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { requireSupabaseClient, type Profile } from '../../lib/supabase';
import { useStudentContextStore } from '../../store/studentContextStore';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

interface FoodControl {
  product_id: string; product_name: string; description: string | null; price: number;
  image_url: string | null; category_id: string | null; category_name: string | null;
  blocked: boolean; reason: string | null; detailed_description: string | null;
  ingredients: string | null; allergens: string | null; calories: number | null;
  protein_g: number | null; carbohydrates_g: number | null; fat_g: number | null;
  fiber_g: number | null; vegetarian: boolean; healthy_choice: boolean;
  ingredients_verified: boolean; nutrition_verified: boolean; nutrition_source: string;
}
interface IngredientBlock { ingredient_name: string; reason: string | null; created_at: string; created_by: string; }
interface NutritionRow {
  product_id: string; detailed_description: string | null; ingredients: string | null; allergens: string | null;
  calories: number | null; protein_g: number | null; carbohydrates_g: number | null;
  fat_g: number | null; fiber_g: number | null; vegetarian: boolean; healthy_choice: boolean;
  ingredients_verified: boolean; nutrition_verified: boolean; nutrition_source: string;
}
interface StudentTarget { id: string; full_name: string; }

const norm = (value: string) => value.toLocaleLowerCase('es').replace(/[^a-z0-9áéíóúüñ]+/gi, ' ').replace(/\s+/g, ' ').trim();
const parseIngredients = (value: string | null | undefined) => [...new Set((value ?? '').split(/[,;|\n\r]+/).map((item) => item.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(Boolean))];
const money = (value: number) => '$' + Number(value ?? 0).toLocaleString('es-CO');
const isStudentRole = (role: Profile['role'] | undefined) => role === 'student' || role === 'both' || role === 'student_parent';

export function ParentFoodControlsPage() {
  const navigate = useNavigate();
  const activeStudent = useStudentContextStore((state) => state.activeStudent);
  const currentUser = useAuthStore((state) => state.user);
  const [foods, setFoods] = useState<FoodControl[]>([]);
  const [ingredientBlocks, setIngredientBlocks] = useState<IngredientBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingIngredient, setSavingIngredient] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [newIngredient, setNewIngredient] = useState('');
  const [newReason, setNewReason] = useState('');

  const target = useMemo<StudentTarget | null>(() => activeStudent
    ? { id: activeStudent.id, full_name: activeStudent.full_name }
    : currentUser && isStudentRole(currentUser.role)
      ? { id: currentUser.id, full_name: currentUser.full_name }
      : null, [activeStudent, currentUser]);
  const parentMode = currentUser?.role === 'parent' && Boolean(activeStudent);
  const backPath = parentMode ? '/parent/family' : currentUser?.role === 'admin' ? '/admin' : '/menu';

  const load = useCallback(async () => {
    if (!target) {
      navigate(currentUser?.role === 'parent' ? '/parent/family' : '/login', { replace: true });
      return;
    }
    setLoading(true);
    try {
      const client = requireSupabaseClient();
      const [foodResult, nutritionResult, blockResult] = await Promise.all([
        client.rpc('get_parent_food_controls', { p_student_user_id: target.id }),
        client.from('product_nutrition').select('product_id,detailed_description,ingredients,allergens,calories,protein_g,carbohydrates_g,fat_g,fiber_g,vegetarian,healthy_choice,ingredients_verified,nutrition_verified,nutrition_source'),
        client.rpc('get_student_ingredient_blocks', { p_student_user_id: target.id }),
      ]);
      if (foodResult.error) throw foodResult.error;
      if (nutritionResult.error) throw nutritionResult.error;
      if (blockResult.error) throw blockResult.error;
      const nutritionById = new Map(((nutritionResult.data ?? []) as NutritionRow[]).map((row) => [row.product_id, row]));
      setFoods(((foodResult.data ?? []) as Array<Record<string, unknown>>).map((raw) => {
        const id = String(raw.product_id ?? '');
        const n = nutritionById.get(id);
        return {
          product_id: id, product_name: String(raw.product_name ?? ''), description: typeof raw.description === 'string' ? raw.description : null,
          price: Number(raw.price ?? 0), image_url: typeof raw.image_url === 'string' ? raw.image_url : null,
          category_id: typeof raw.category_id === 'string' ? raw.category_id : null, category_name: typeof raw.category_name === 'string' ? raw.category_name : null,
          blocked: raw.blocked === true, reason: typeof raw.reason === 'string' ? raw.reason : null,
          detailed_description: n?.detailed_description ?? null, ingredients: n?.ingredients ?? null, allergens: n?.allergens ?? null,
          calories: n?.calories ?? null, protein_g: n?.protein_g ?? null, carbohydrates_g: n?.carbohydrates_g ?? null, fat_g: n?.fat_g ?? null,
          fiber_g: n?.fiber_g ?? null, vegetarian: n?.vegetarian === true, healthy_choice: n?.healthy_choice === true,
          ingredients_verified: n?.ingredients_verified === true, nutrition_verified: n?.nutrition_verified === true, nutrition_source: n?.nutrition_source ?? 'manual',
        };
      }));
      setIngredientBlocks((blockResult.data ?? []) as IngredientBlock[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar alimentos y preferencias.');
    } finally { setLoading(false); }
  }, [currentUser?.role, navigate, target]);
  useEffect(() => { void load(); }, [load]);

  const blockedKeys = useMemo(() => new Set(ingredientBlocks.map((block) => norm(block.ingredient_name))), [ingredientBlocks]);
  const availableIngredients = useMemo(() => {
    const found = new Map<string, string>();
    for (const food of foods) for (const name of parseIngredients(food.ingredients)) {
      const key = norm(name); if (key && !found.has(key)) found.set(key, name);
    }
    for (const block of ingredientBlocks) { const key = norm(block.ingredient_name); if (key && !found.has(key)) found.set(key, block.ingredient_name); }
    return [...found.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [foods, ingredientBlocks]);
  const filteredFoods = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es');
    return needle ? foods.filter((food) => [food.product_name, food.description, food.detailed_description, food.category_name, food.ingredients, food.allergens].filter(Boolean).join(' ').toLocaleLowerCase('es').includes(needle)) : foods;
  }, [foods, query]);

  const toggleFood = async (food: FoodControl) => {
    if (!target || savingId) return;
    setSavingId(food.product_id);
    try {
      const { data, error } = await requireSupabaseClient().rpc('set_parent_food_block', {
        p_student_user_id: target.id, p_product_id: food.product_id, p_blocked: !food.blocked, p_reason: food.reason,
      });
      if (error) throw error;
      setFoods((rows) => rows.map((row) => row.product_id === food.product_id ? { ...row, blocked: data === true } : row));
      toast.success(data ? food.product_name + ' quedó bloqueado.' : food.product_name + ' volvió a estar permitido.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el bloqueo.');
    } finally { setSavingId(null); }
  };

  const changeIngredientBlock = async (name: string, blocked: boolean, reason: string | null = null) => {
    if (!target || savingIngredient) return;
    const key = norm(name);
    if (!key) return toast.error('Escribe un ingrediente válido.');
    setSavingIngredient(key);
    try {
      const { error } = await requireSupabaseClient().rpc('set_student_ingredient_block', {
        p_student_user_id: target.id, p_ingredient_name: name.trim(), p_blocked: blocked, p_reason: reason,
      });
      if (error) {
        if (/invalid_ingredient_name/i.test(error.message)) throw new Error('El ingrediente debe tener entre 2 y 100 caracteres.');
        throw error;
      }
      toast.success(blocked ? 'Ingrediente bloqueado: ' + name : 'Ingrediente permitido: ' + name);
      if (blocked) setNewIngredient('');
      setNewReason('');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar la restricción.');
    } finally { setSavingIngredient(null); }
  };

  if (!target) return null;
  return <div className="qb-page min-h-screen p-5 sm:p-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button type="button" onClick={() => navigate(backPath)} className="mt-1 rounded-full border qb-border qb-surface p-3 qb-text" aria-label="Volver"><ArrowLeft className="h-5 w-5" /></button>
          <div><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700 dark:text-emerald-300">Alimentación y bienestar</p><h1 className="qb-text mt-1 text-3xl font-black">{parentMode ? 'Preferencias de' : 'Mis preferencias de'} {target.full_name}</h1><p className="qb-text-secondary mt-1 max-w-2xl text-sm">Bloquea alimentos o ingredientes. Las restricciones también se validan al confirmar el pedido.</p></div>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-300/20 dark:bg-emerald-500/10 dark:text-emerald-200"><ShieldCheck className="h-5 w-5" />{foods.filter((food) => food.blocked).length} alimentos · {ingredientBlocks.length} ingredientes bloqueados</div>
      </header>

      <section className="qb-surface space-y-4 rounded-[2rem] border qb-border p-5 shadow-lg">
        <div className="flex items-start gap-3"><Lock className="mt-1 h-5 w-5 text-rose-600" /><div><h2 className="qb-text font-black">Ingredientes bloqueados</h2><p className="qb-text-secondary mt-1 text-sm">Bloquear un ingrediente impide confirmar pedidos con ese ingrediente en la lista registrada. Verifica la receta o etiqueta: la IA puede equivocarse u omitir subingredientes.</p></div></div>
        <form onSubmit={(event) => { event.preventDefault(); void changeIngredientBlock(newIngredient, true, newReason.trim() || null); }} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Input value={newIngredient} onChange={(event) => setNewIngredient(event.target.value)} placeholder="Ej. maní, leche, huevo, gluten…" maxLength={100} required />
          <Input value={newReason} onChange={(event) => setNewReason(event.target.value)} placeholder="Motivo (opcional)" maxLength={240} />
          <Button type="submit" disabled={savingIngredient !== null || !newIngredient.trim()} className="bg-rose-600 font-black text-white hover:bg-rose-700"><Plus className="mr-2 h-4 w-4" />Bloquear ingrediente</Button>
        </form>
        <div className="flex flex-wrap gap-2">{ingredientBlocks.map((block) => <span key={norm(block.ingredient_name)} className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800 dark:border-rose-300/20 dark:bg-rose-500/10 dark:text-rose-100">{block.ingredient_name}<button type="button" onClick={() => void changeIngredientBlock(block.ingredient_name, false)} disabled={savingIngredient !== null} aria-label={'Permitir ' + block.ingredient_name} className="rounded-full p-0.5 hover:bg-rose-200 disabled:opacity-50"><X className="h-3.5 w-3.5" /></button></span>)}{!loading && ingredientBlocks.length === 0 && <p className="qb-text-secondary text-sm">Todavía no has bloqueado ingredientes.</p>}</div>
        {availableIngredients.length > 0 && <div className="border-t qb-border pt-3"><p className="qb-text-secondary mb-2 text-xs font-bold">Ingredientes detectados en las fichas</p><div className="flex flex-wrap gap-2">{availableIngredients.map(([key, label]) => {
          const blocked = blockedKeys.has(key);
          return <button key={key} type="button" disabled={savingIngredient !== null} onClick={() => void changeIngredientBlock(label, !blocked)} className={'rounded-full border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ' + (blocked ? 'border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-300/30 dark:bg-rose-500/15 dark:text-rose-100' : 'qb-border qb-surface qb-text-secondary hover:border-rose-300 hover:text-rose-700')}>{blocked ? '✓ ' : '+ '}{label}</button>;
        })}</div></div>}
      </section>

      <section className="qb-surface space-y-4 rounded-[2rem] border qb-border p-5 shadow-lg">
        <div className="flex flex-wrap items-center gap-3"><div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-2xl border qb-border bg-slate-50 px-4 py-3 dark:bg-slate-900/60"><Search className="h-4 w-4 qb-text-secondary" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none qb-text" placeholder="Buscar alimento, ingrediente o alérgeno…" /></div><div className="flex items-center gap-2 text-xs font-semibold qb-text-secondary"><Leaf className="h-4 w-4 text-emerald-600" />Los cambios se aplican a los pedidos.</div></div>
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-300/20 dark:bg-amber-500/10 dark:text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>Una ficha creada con IA es un borrador. Confirma ingredientes y alérgenos con la cafetería; la ficha por sí sola no garantiza que un alimento sea seguro para una alergia.</span></div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {loading ? <div className="qb-surface col-span-full rounded-3xl border qb-border p-8 text-center qb-text-secondary">Cargando alimentos y fichas…</div> : filteredFoods.length === 0 ? <div className="qb-surface col-span-full rounded-3xl border qb-border p-8 text-center qb-text-secondary">No encontramos alimentos con esa búsqueda.</div> : filteredFoods.map((food) => {
          const names = parseIngredients(food.ingredients);
          const matched = names.filter((name) => blockedKeys.has(norm(name)));
          return <article key={food.product_id} className={'qb-surface rounded-3xl border p-4 shadow-sm transition ' + (food.blocked || matched.length > 0 ? 'border-rose-300 bg-rose-50/40 dark:border-rose-300/25 dark:bg-rose-500/5' : 'qb-border')}>
            <div className="flex items-start gap-3">{food.image_url && <img src={food.image_url} alt="" className="h-16 w-16 rounded-xl object-cover" loading="lazy" />}<div className="min-w-0 flex-1"><p className="text-[11px] font-black uppercase tracking-[.16em] text-emerald-700 dark:text-emerald-300">{food.category_name ?? 'Alimento'}</p><h2 className="qb-text mt-1 font-black">{food.product_name}</h2>{food.description && <p className="qb-text-secondary mt-1 text-xs">{food.description}</p>}<p className="qb-text mt-2 text-sm font-black">{money(food.price)}</p></div>{food.blocked ? <Lock className="h-5 w-5 shrink-0 text-rose-600" /> : matched.length ? <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" /> : <Unlock className="h-5 w-5 shrink-0 text-emerald-600" />}</div>
            {(!food.ingredients_verified || food.nutrition_source === 'ai_draft') && <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-[11px] leading-4 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{food.nutrition_source === 'ai_draft' ? 'Ingredientes sugeridos por IA: sin verificar.' : 'Ingredientes no verificados por la cafetería.'}</p>}
            {matched.length > 0 && <p className="mt-2 text-xs font-bold text-rose-700 dark:text-rose-200">Coincide con una restricción: {matched.join(', ')}</p>}
            <details className="mt-3 rounded-xl border qb-border p-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-black qb-text"><Utensils className="h-4 w-4 text-emerald-600" />Detalle, ingredientes y nutrición</summary>
              <div className="mt-3 space-y-3">
                {food.detailed_description && <p className="qb-text-secondary text-sm leading-5">{food.detailed_description}</p>}
                <div><h3 className="qb-text text-xs font-black uppercase tracking-wide">Ingredientes registrados</h3>{names.length ? <div className="mt-2 flex flex-wrap gap-1.5">{names.map((name) => { const isBlocked = blockedKeys.has(norm(name)); return <button key={norm(name)} type="button" onClick={() => void changeIngredientBlock(name, !isBlocked)} disabled={savingIngredient !== null} title={isBlocked ? 'Permitir ingrediente' : 'Bloquear ingrediente'} className={'rounded-full border px-2.5 py-1 text-[11px] font-bold disabled:opacity-50 ' + (isBlocked ? 'border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-300/30 dark:bg-rose-500/15 dark:text-rose-100' : 'qb-border qb-surface qb-text-secondary hover:border-rose-300')}>{isBlocked ? '🔒 ' : '+ '}{name}</button>; })}</div> : <p className="mt-1 text-xs qb-text-secondary">No hay ingredientes registrados.</p>}</div>
                <div><h3 className="qb-text text-xs font-black uppercase tracking-wide">Alérgenos indicados</h3><p className="mt-1 text-sm qb-text-secondary">{food.allergens || 'No registrados. Esto no significa que esté libre de alérgenos.'}</p></div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{([['Energía', food.calories, 'kcal'], ['Proteína', food.protein_g, 'g'], ['Carbohidratos', food.carbohydrates_g, 'g'], ['Grasa', food.fat_g, 'g'], ['Fibra', food.fiber_g, 'g']] as const).map(([label, value, unit]) => <div key={label} className="rounded-lg bg-white/70 p-2 dark:bg-slate-900/50"><p className="text-[10px] font-bold qb-text-secondary">{label}</p><p className="text-sm font-black qb-text">{value == null ? '—' : Number(value).toLocaleString('es-CO') + ' ' + unit}</p></div>)}</div>
                {(food.vegetarian || food.healthy_choice) && <div className="flex flex-wrap gap-2">{food.vegetarian && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">Vegetariano</span>}{food.healthy_choice && <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-bold text-blue-800">Opción saludable provisional</span>}</div>}
                {food.nutrition_verified && <p className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300"><Check className="h-3.5 w-3.5" />Nutrición verificada</p>}
                <p className="flex items-start gap-1.5 text-[11px] leading-4 qb-text-secondary"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Los valores son orientativos según el registro de la cafetería; revisa la etiqueta si necesitas cifras exactas.</p>
              </div>
            </details>
            <div className="mt-3 flex items-center justify-between gap-2"><span className={'text-xs font-bold ' + (food.blocked || matched.length ? 'text-rose-700 dark:text-rose-200' : 'qb-text-secondary')}>{food.blocked ? 'Alimento bloqueado' : matched.length ? 'Contiene ingrediente bloqueado' : 'Alimento permitido'}</span><Button type="button" onClick={() => void toggleFood(food)} disabled={savingId === food.product_id} className={food.blocked ? 'bg-emerald-600 font-black text-white hover:bg-emerald-700' : 'bg-rose-600 font-black text-white hover:bg-rose-700'}>{savingId === food.product_id ? 'Guardando…' : food.blocked ? <><Unlock className="mr-2 h-4 w-4" />Permitir alimento</> : <><Lock className="mr-2 h-4 w-4" />Bloquear alimento</>}</Button></div>
          </article>;
        })}
      </section>
    </div>
  </div>;
}
