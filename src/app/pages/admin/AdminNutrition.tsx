import { useEffect, useState } from 'react';
import { AlertTriangle, Leaf, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useDataStore } from '../../../store/dataStore';
import { requireSupabaseClient } from '../../../lib/supabase';

import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';

interface Nutrition {
  product_id: string;
  detailed_description: string | null;
  calories: number | null;
  protein_g: number | null;
  carbohydrates_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  ingredients: string | null;
  allergens: string | null;
  vegetarian: boolean;
  healthy_choice: boolean;
  ingredients_verified: boolean;
  nutrition_verified: boolean;
  nutrition_source: 'manual' | 'ai_draft' | 'label';
}
const empty = (id: string): Nutrition => ({
  product_id: id, detailed_description: '', calories: null, protein_g: null, carbohydrates_g: null,
  fat_g: null, fiber_g: null, ingredients: '', allergens: '', vegetarian: false, healthy_choice: false,
  ingredients_verified: false, nutrition_verified: false, nutrition_source: 'manual',
});
const numericFields = [['calories', 'Calorías (kcal)'], ['protein_g', 'Proteína (g)'], ['carbohydrates_g', 'Carbohidratos (g)'], ['fat_g', 'Grasa (g)'], ['fiber_g', 'Fibra (g)']] as const;

export function AdminNutrition() {
  const { products, categories } = useDataStore();
  const [rows, setRows] = useState<Record<string, Nutrition>>({});
  const [recipeNotes, setRecipeNotes] = useState<Record<string, string>>({});
  const [aiWarnings, setAiWarnings] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [draftText, setDraftText] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      try {
        const { data, error } = await requireSupabaseClient().from('product_nutrition').select('*');
        if (error) throw error;
        const next: Record<string, Nutrition> = {};
        (data ?? []).forEach((raw) => {
          const row = raw as Nutrition;
          next[row.product_id] = { ...empty(row.product_id), ...row };
        });
        setRows(next);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo cargar la información nutricional.');
      }
    })();
  }, []);

  const update = (id: string, patch: Partial<Nutrition>) => setRows((current) => ({
    ...current, [id]: { ...(current[id] ?? empty(id)), ...patch },
  }));

  const applyDraft = (productId: string) => {
    try {
      const parsed = JSON.parse(draftText[productId] ?? '') as Record<string, unknown>;
      const asText = (value: unknown) => Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean).join('; ')
        : typeof value === 'string' ? value : '';
      const detailed = typeof parsed.detailed_description === 'string' ? parsed.detailed_description : '';
      const ingredients = asText(parsed.ingredients);
      if (!detailed.trim() || !ingredients.trim()) throw new Error('El JSON debe incluir detailed_description e ingredients.');
      const numberField = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
      update(productId, {
        detailed_description: detailed, ingredients, allergens: asText(parsed.allergens),
        calories: numberField(parsed.calories), protein_g: numberField(parsed.protein_g),
        carbohydrates_g: numberField(parsed.carbohydrates_g), fat_g: numberField(parsed.fat_g), fiber_g: numberField(parsed.fiber_g),
        vegetarian: parsed.vegetarian === true, healthy_choice: parsed.healthy_choice === true,
        ingredients_verified: false, nutrition_verified: false, nutrition_source: 'ai_draft',
      });
      setAiWarnings((current) => ({
        ...current,
        [productId]: Array.isArray(parsed.warnings) ? parsed.warnings.filter((warning): warning is string => typeof warning === 'string') : ['Borrador de ChatGPT: contrasta ingredientes y alérgenos con la receta o etiqueta real.'],
      }));
      setDraftText((current) => ({ ...current, [productId]: '' }));
      toast.success('Borrador importado. Los indicadores de verificación quedaron desmarcados.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Pega un JSON válido generado desde ChatGPT.');
    }
  };

  const copyInstructions = async (productId: string, name: string, description: string | null, categoryId: string | null) => {
    const category = categories.find((item) => item.id === categoryId)?.name ?? '';
    const prompt = [
      'Prepara un BORRADOR en español de una ficha de alimento escolar y devuelve solo JSON válido, sin markdown.',
      'No inventes ingredientes sin respaldo de receta/etiqueta. Distingue alérgenos probables de confirmados y nunca garantices seguridad para una alergia.',
      'Si no hay receta, etiqueta ni tamaño de porción, usa null en calorías y macronutrientes. Añade warnings que la cafetería debe comprobar.',
      'Esquema: {"detailed_description":"...", "ingredients":["..."], "allergens":["..."], "calories":null, "protein_g":null, "carbohydrates_g":null, "fat_g":null, "fiber_g":null, "vegetarian":false, "healthy_choice":false, "warnings":["..."]}.',
      'Alimento: ' + name + '. Categoría: ' + (category || '[categoría]') + '. Descripción: ' + (description || '[sin descripción]') + '.',
      'Receta/etiqueta del proveedor: ' + ((recipeNotes[productId] ?? '').trim() || '[pega ingredientes y subingredientes reales; no inventes]') + '.',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success('Instrucciones copiadas. Pégalas en ChatGPT y pega aquí el JSON resultante.');
    } catch {
      toast.error('No se pudo copiar automáticamente. Puedes redactar la ficha directamente en ChatGPT.');
    }
  };

  const save = async (id: string) => {
    setSaving(id);
    try {
      const row = rows[id] ?? empty(id);
      const values = [row.calories, row.protein_g, row.carbohydrates_g, row.fat_g, row.fiber_g];
      if (values.some((value) => value != null && (!Number.isFinite(Number(value)) || Number(value) < 0))) {
        throw new Error('Los valores nutricionales deben ser números mayores o iguales a cero.');
      }
      const { error } = await requireSupabaseClient().from('product_nutrition').upsert({
        ...row, updated_at: new Date().toISOString(),
      }, { onConflict: 'product_id' });
      if (error) throw error;
      toast.success(row.ingredients_verified ? 'Ficha guardada; ingredientes marcados como verificados.' : 'Ficha guardada como pendiente de verificar.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar.');
    } finally { setSaving(null); }
  };

  return <div className="space-y-6">
    <header><div className="flex items-center gap-3"><Leaf className="h-7 w-7 text-emerald-600" /><div><h1 className="text-3xl font-black">Información nutricional e ingredientes</h1><p className="text-sm text-slate-500">Completa las fichas que ven estudiantes y padres. Los borradores se crean manualmente en ChatGPT; verifica receta y etiqueta antes de marcar una ficha.</p></div></div></header>
    <div className="grid gap-5 lg:grid-cols-2">
      {products.map((product) => {
        const row = rows[product.id] ?? empty(product.id);
        return <article key={product.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4"><h2 className="font-black text-slate-900">{product.name}</h2><p className="text-xs text-slate-500">{product.description ?? 'Sin descripción'} · {categories.find((item) => item.id === product.category_id)?.name ?? 'Sin categoría'}</p></div>
          <div className="space-y-3">
            <label className="block space-y-1"><span className="text-xs font-bold text-slate-600">Fuente real: receta o etiqueta del proveedor</span><Textarea value={recipeNotes[product.id] ?? ''} onChange={(event) => setRecipeNotes((current) => ({ ...current, [product.id]: event.target.value }))} rows={2} placeholder="Pega ingredientes, subingredientes y tamaño de porción confirmados…" /></label>
            <div className="space-y-2">
              <Button type="button" variant="outline" onClick={() => void copyInstructions(product.id, product.name, product.description ?? null, product.category_id ?? null)} className="w-full">Copiar instrucciones para ChatGPT</Button>
              <Textarea value={draftText[product.id] ?? ''} onChange={(event) => setDraftText((current) => ({ ...current, [product.id]: event.target.value }))} rows={3} placeholder="Pega aquí el JSON de ChatGPT…" />
              <Button type="button" variant="outline" onClick={() => applyDraft(product.id)} disabled={!(draftText[product.id] ?? '').trim()} className="w-full">Aplicar borrador pegado</Button>
            </div>
            {row.nutrition_source === 'ai_draft' && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><p className="font-black">Borrador de IA no verificado</p><p>La IA puede inferir u omitir ingredientes, subingredientes o alérgenos. No uses la sugerencia como garantía de seguridad ante alergias.</p>{(aiWarnings[product.id] ?? []).map((warning) => <p key={warning}>• {warning}</p>)}</div>}
            <label className="block space-y-1"><span className="text-xs font-bold text-slate-600">Descripción detallada</span><Textarea value={row.detailed_description ?? ''} onChange={(event) => update(product.id, { detailed_description: event.target.value, ingredients_verified: false })} rows={3} placeholder="Descripción detallada del alimento y preparación" /></label>
            <label className="block space-y-1"><span className="text-xs font-bold text-slate-600">Ingredientes exactos (separados por punto y coma)</span><Textarea value={row.ingredients ?? ''} onChange={(event) => update(product.id, { ingredients: event.target.value, ingredients_verified: false })} rows={3} placeholder="Harina de trigo; leche; huevo; queso; aceite vegetal…" /><p className="text-[11px] text-slate-500">Incluye los subingredientes de salsas, mezclas y productos empacados.</p></label>
            <label className="block space-y-1"><span className="text-xs font-bold text-slate-600">Alérgenos indicados</span><Input value={row.allergens ?? ''} onChange={(event) => update(product.id, { allergens: event.target.value, nutrition_verified: false })} placeholder="Ej. leche, trigo, huevo, soya" /></label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{numericFields.map(([key, label]) => <label key={key} className="space-y-1"><span className="text-xs font-bold text-slate-600">{label}</span><Input type="number" min="0" step="0.1" value={row[key] ?? ''} onChange={(event) => update(product.id, { [key]: event.target.value === '' ? null : Number(event.target.value), nutrition_verified: false })} /></label>)}</div>
            <div className="flex flex-wrap gap-4 text-sm font-semibold text-slate-700"><label className="flex items-center gap-2"><input type="checkbox" checked={row.vegetarian} onChange={(event) => update(product.id, { vegetarian: event.target.checked })} />Vegetariano</label><label className="flex items-center gap-2"><input type="checkbox" checked={row.healthy_choice} onChange={(event) => update(product.id, { healthy_choice: event.target.checked })} />Opción saludable</label></div>
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label className="flex items-start gap-2 text-xs leading-5 text-slate-700"><input type="checkbox" className="mt-1 h-4 w-4" checked={row.ingredients_verified} onChange={(event) => update(product.id, { ingredients_verified: event.target.checked })} /><span><strong>Ingredientes verificados.</strong> Comprobé la lista completa con la receta real o la etiqueta del proveedor.</span></label>
              <label className="flex items-start gap-2 text-xs leading-5 text-slate-700"><input type="checkbox" className="mt-1 h-4 w-4" checked={row.nutrition_verified} onChange={(event) => update(product.id, { nutrition_verified: event.target.checked })} /><span>Verifiqué los valores nutricionales con una fuente fiable. No marques esto solo por aceptar los datos de la IA.</span></label>
              {!row.ingredients_verified && <p className="flex items-start gap-1.5 text-[11px] leading-4 text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Esta lista no puede considerarse verificada para el bloqueo fiable de ingredientes.</p>}
            </div>
          </div>
          <Button type="button" onClick={() => void save(product.id)} disabled={saving === product.id} className="mt-4 w-full bg-emerald-600 font-black text-white hover:bg-emerald-700"><Save className="mr-2 h-4 w-4" />{saving === product.id ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Guardando…</> : 'Guardar información'}</Button>
        </article>;
      })}
    </div>
  </div>;
}
