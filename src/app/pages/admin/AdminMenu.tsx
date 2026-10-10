import { useState } from 'react';
import { CheckCircle2, Utensils } from 'lucide-react';

import { useDataStore } from '../../../store/dataStore';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { requireSupabaseClient, type Product } from '../../../lib/supabase';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400';

interface NutritionDraft {
  detailed_description: string;
  ingredients: string;
  allergens: string;
  calories: string;
  protein_g: string;
  carbohydrates_g: string;
  fat_g: string;
  fiber_g: string;
  vegetarian: boolean;
  healthy_choice: boolean;
  ingredients_verified: boolean;
  nutrition_verified: boolean;
  nutrition_source: 'manual' | 'ai_draft' | 'label';
  recipe_notes: string;
}
const emptyNutrition = (): NutritionDraft => ({
  detailed_description: '', ingredients: '', allergens: '',
  calories: '', protein_g: '', carbohydrates_g: '', fat_g: '', fiber_g: '',
  vegetarian: false, healthy_choice: false, ingredients_verified: false,
  nutrition_verified: false, nutrition_source: 'manual', recipe_notes: '',
});
const numericDraft = (value: string) => value.trim() === '' ? null : Number(value);

export function AdminMenu() {
  const { products, categories, addProduct, updateProduct, deleteProduct } = useDataStore();
  const safeProducts = Array.isArray(products) ? products : [];
  const safeCategories = Array.isArray(categories) ? categories : [];
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', price: '', image_url: '', category_id: '', stock: '', available: true });
  const [nutritionForm, setNutritionForm] = useState<NutritionDraft>(emptyNutrition());
  const [draftText, setDraftText] = useState('');
  const [savingNutrition, setSavingNutrition] = useState(false);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);

  const openNewProductDialog = () => {
    setEditingProduct(null);
    setFormData({ name: '', description: '', price: '', image_url: '', category_id: safeCategories[0]?.id || '', stock: '', available: true });
    setNutritionForm(emptyNutrition());
    setAiWarnings([]);
    setIsDialogOpen(true);
  };

  const openEditProductDialog = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name ?? '',
      description: product.description ?? '',
      price: String(Number(product.price ?? 0)),
      image_url: product.image_url ?? '',
      category_id: product.category_id ?? '',
      stock: String(Number(product.stock ?? 0)),
      available: product.available !== false,
    });
    setNutritionForm(emptyNutrition());
    setAiWarnings([]);
    setIsDialogOpen(true);
    void (async () => {
      try {
        const { data, error } = await requireSupabaseClient()
          .from('product_nutrition')
          .select('detailed_description,ingredients,allergens,calories,protein_g,carbohydrates_g,fat_g,fiber_g,vegetarian,healthy_choice,ingredients_verified,nutrition_verified,nutrition_source')
          .eq('product_id', product.id)
          .maybeSingle();
        if (error) throw error;
        if (!data) return;
        setNutritionForm({
          ...emptyNutrition(),
          detailed_description: data.detailed_description ?? '',
          ingredients: data.ingredients ?? '',
          allergens: data.allergens ?? '',
          calories: data.calories == null ? '' : String(data.calories),
          protein_g: data.protein_g == null ? '' : String(data.protein_g),
          carbohydrates_g: data.carbohydrates_g == null ? '' : String(data.carbohydrates_g),
          fat_g: data.fat_g == null ? '' : String(data.fat_g),
          fiber_g: data.fiber_g == null ? '' : String(data.fiber_g),
          vegetarian: data.vegetarian === true,
          healthy_choice: data.healthy_choice === true,
          ingredients_verified: data.ingredients_verified === true,
          nutrition_verified: data.nutrition_verified === true,
          nutrition_source: data.nutrition_source === 'label' || data.nutrition_source === 'ai_draft' ? data.nutrition_source : 'manual',
          recipe_notes: '',
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo cargar la ficha nutricional.');
      }
    })();
  };

  const applyPastedNutritionDraft = () => {
    try {
      const suggestion = JSON.parse(draftText) as Record<string, unknown>;
      const asText = (value: unknown) => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean).join('; ') : typeof value === 'string' ? value : '';
      const detailed = typeof suggestion.detailed_description === 'string' ? suggestion.detailed_description : '';
      const ingredients = asText(suggestion.ingredients);
      if (!detailed.trim() || !ingredients.trim()) throw new Error('El JSON debe incluir detailed_description e ingredients.');
      const numberField = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
      setNutritionForm((current) => ({
        ...current, detailed_description: detailed, ingredients, allergens: asText(suggestion.allergens).replace(/; /g, ', '),
        calories: numberField(suggestion.calories), protein_g: numberField(suggestion.protein_g), carbohydrates_g: numberField(suggestion.carbohydrates_g),
        fat_g: numberField(suggestion.fat_g), fiber_g: numberField(suggestion.fiber_g), vegetarian: suggestion.vegetarian === true,
        healthy_choice: suggestion.healthy_choice === true, ingredients_verified: false, nutrition_verified: false, nutrition_source: 'ai_draft',
      }));
      if (!formData.description.trim()) setFormData((current) => ({ ...current, description: detailed.slice(0, 260) }));
      setAiWarnings(Array.isArray(suggestion.warnings) ? suggestion.warnings.filter((w): w is string => typeof w === 'string') : ['Borrador de ChatGPT: contrasta ingredientes y alérgenos con la receta real.']);
      setDraftText('');
      toast.success('Borrador pegado. Verifica ingredientes, alérgenos y nutrientes antes de guardar.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Pega un JSON válido generado desde ChatGPT.'); }
  };

  const copyChatGptInstructions = async () => {
    const category = safeCategories.find((entry) => entry.id === formData.category_id)?.name ?? '';
    const prompt = [
      'Prepara un BORRADOR en español de una ficha de alimento escolar. Devuelve solo JSON válido, sin markdown.',
      'No inventes ingredientes sin respaldo de receta o etiqueta. Distingue alérgenos probables de confirmados. Nunca garantices seguridad para una alergia.',
      'Si falta receta, etiqueta o tamaño de porción, usa null en calorías y macronutrientes. Añade warnings con lo que debe verificar la cafetería.',
      'Esquema: {"detailed_description":"...", "ingredients":["..."], "allergens":["..."], "calories":null, "protein_g":null, "carbohydrates_g":null, "fat_g":null, "fiber_g":null, "vegetarian":false, "healthy_choice":false, "warnings":["..."]}.',
      'Alimento: ' + (formData.name || '[nombre]') + '. Categoría: ' + (category || '[categoría]') + '. Descripción: ' + (formData.description || '[sin descripción]') + '.',
      'Receta o etiqueta real del proveedor: [pega aquí los ingredientes y subingredientes reales].',
    ].join('\n');
    try { await navigator.clipboard.writeText(prompt); toast.success('Instrucciones copiadas. Pégalas en ChatGPT y luego pega aquí el JSON.'); }
    catch { toast.error('No se pudo copiar automáticamente. Escribe las instrucciones directamente en ChatGPT.'); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = Number(formData.price);
    const stock = Number.parseInt(formData.stock, 10);
    if (!Number.isFinite(price) || price <= 0) return void toast.error('Ingresa un precio válido');
    if (!Number.isInteger(stock) || stock < 0) return void toast.error('Ingresa un stock válido');
    if (!formData.name.trim() || !formData.category_id) return void toast.error('Completa todos los campos requeridos');
    const ingredientList = nutritionForm.ingredients.split(/[,;|\\n\\r]+/).map((item) => item.trim()).filter(Boolean);
    if (formData.available && ingredientList.length === 0) {
      return void toast.error('Antes de publicar, registra la lista real de ingredientes o guarda el producto oculto mientras la completas.');
    }
    if (formData.available && !nutritionForm.ingredients_verified) {
      return void toast.error('Confirma que los ingredientes coinciden con la receta o etiqueta real antes de publicar el alimento.');
    }
    const numericValues = [nutritionForm.calories, nutritionForm.protein_g, nutritionForm.carbohydrates_g, nutritionForm.fat_g, nutritionForm.fiber_g];
    if (numericValues.some((value) => value.trim() !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0))) {
      return void toast.error('Los valores nutricionales deben ser números mayores o iguales a cero.');
    }

    const productData = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      price,
      image_url: formData.image_url.trim() || FALLBACK_IMAGE,
      category_id: formData.category_id,
      stock,
      available: formData.available,
    };

    try {
      let productId: string;
      if (editingProduct) {
        await updateProduct(editingProduct.id, productData);
        productId = editingProduct.id;
      } else {
        productId = await addProduct(productData);
      }
      setSavingNutrition(true);
      const nutritionRow = {
        product_id: productId,
        detailed_description: nutritionForm.detailed_description.trim() || null,
        ingredients: ingredientList.join('; '),
        allergens: nutritionForm.allergens.trim() || null,
        calories: numericDraft(nutritionForm.calories),
        protein_g: numericDraft(nutritionForm.protein_g),
        carbohydrates_g: numericDraft(nutritionForm.carbohydrates_g),
        fat_g: numericDraft(nutritionForm.fat_g),
        fiber_g: numericDraft(nutritionForm.fiber_g),
        vegetarian: nutritionForm.vegetarian,
        healthy_choice: nutritionForm.healthy_choice,
        ingredients_verified: nutritionForm.ingredients_verified,
        nutrition_verified: nutritionForm.nutrition_verified,
        nutrition_source: nutritionForm.nutrition_source,
        updated_at: new Date().toISOString(),
      };
      const { error } = await (await import('../../../lib/supabase')).requireSupabaseClient()
        .from('product_nutrition').upsert(nutritionRow, { onConflict: 'product_id' });
      if (error) {
        toast.error(`El producto se guardó, pero no se pudo guardar su ficha nutricional: ${error.message}`);
        return;
      }
      toast.success(editingProduct ? 'Producto y ficha nutricional actualizados.' : 'Producto y ficha nutricional creados.');
      setIsDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el producto');
    } finally {
      setSavingNutrition(false);
    }
  };

  const handleDelete = async (productId: string, productName: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar "${productName}"?`)) return;
    try {
      await deleteProduct(productId);
      toast.success('Producto eliminado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar el producto');
    }
  };

  const getCategoryName = (categoryId: string | null | undefined) => safeCategories.find((c) => c.id === categoryId)?.name || 'Sin categoría';

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div><h1 className="mb-2 text-4xl font-bold text-blue-900">Edición de Menú</h1><p className="text-lg text-gray-600">Agrega, edita o elimina productos del menú</p></div>
        <Button onClick={openNewProductDialog} className="bg-blue-600 text-white shadow-sm hover:bg-blue-700"><Plus className="mr-2 h-5 w-5" />Agregar Producto</Button>
      </div>

      {safeProducts.length === 0 ? (
        <Card className="border border-slate-200 bg-white p-8 text-center"><p className="font-bold text-slate-800">No hay productos para mostrar</p><p className="mt-1 text-sm text-slate-500">Comprueba la conexión con Supabase o agrega el primer producto.</p></Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {safeProducts.map((product) => {
            const image = product.image_url?.trim() || FALLBACK_IMAGE;
            const price = Number(product.price ?? 0);
            const stock = Number(product.stock ?? 0);
            return (
              <Card key={product.id} className="overflow-hidden border border-slate-200 bg-white shadow-sm transition hover:shadow-lg">
                <div className="aspect-square overflow-hidden bg-gray-100">
                  <img src={image} alt={product.name || 'Producto'} className="h-full w-full object-cover" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = FALLBACK_IMAGE; }} />
                </div>
                <div className="p-4">
                  <div className="mb-3"><h3 className="mb-1 text-lg font-bold text-blue-900">{product.name || 'Producto sin nombre'}</h3><p className="line-clamp-2 min-h-[40px] text-sm text-gray-600">{product.description || 'Sin descripción'}</p></div>
                  <div className="mb-4 space-y-2">
                    <div className="flex items-center justify-between"><span className="text-sm text-gray-600">Precio:</span><span className="text-xl font-bold text-green-700">${price.toLocaleString('es-CO')}</span></div>
                    <div className="flex items-center justify-between"><span className="text-sm text-gray-600">Stock:</span><span className={`font-bold ${stock === 0 ? 'text-red-600' : stock <= 5 ? 'text-amber-600' : 'text-green-700'}`}>{stock}</span></div>
                    <div className="flex items-center justify-between"><span className="text-sm text-gray-600">Categoría:</span><span className="text-sm font-medium text-blue-900">{getCategoryName(product.category_id)}</span></div>
                    <div className="flex items-center justify-between"><span className="text-sm text-gray-600">Estado:</span><span className={`text-sm font-medium ${product.available ? 'text-green-700' : 'text-gray-500'}`}>{product.available ? 'Visible' : 'Oculto'}</span></div>
                  </div>
                  <div className="flex gap-2"><Button onClick={() => openEditProductDialog(product)} size="sm" className="flex-1 bg-blue-600 text-white hover:bg-blue-700"><Edit className="mr-2 h-4 w-4" />Editar</Button><Button onClick={() => handleDelete(product.id, product.name || 'producto')} size="sm" variant="destructive" className="flex-1"><Trash2 className="mr-2 h-4 w-4" />Eliminar</Button></div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle className="text-2xl">{editingProduct ? 'Editar Producto' : 'Agregar Producto'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Label htmlFor="name">Nombre del Producto *</Label><Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Ej: Hamburguesa Clásica" required /></div>
              <div className="col-span-2"><Label htmlFor="description">Descripción</Label><Textarea id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Descripción del producto" rows={3} /></div>
              <div><Label htmlFor="price">Precio *</Label><Input id="price" type="number" min="0" step="100" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} placeholder="Ej: 10000" required /></div>
              <div><Label htmlFor="stock">Stock *</Label><Input id="stock" type="number" min="0" value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: e.target.value })} placeholder="Ej: 20" required /></div>
              <div className="col-span-2"><Label htmlFor="category">Categoría *</Label><Select value={formData.category_id} onValueChange={(value) => setFormData({ ...formData, category_id: value })}><SelectTrigger><SelectValue placeholder="Selecciona una categoría" /></SelectTrigger><SelectContent>{safeCategories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="col-span-2"><Label htmlFor="image_url">URL de Imagen</Label><Input id="image_url" type="url" value={formData.image_url} onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} placeholder="https://example.com/image.jpg" /><p className="mt-1 text-xs text-gray-500">Deja en blanco para usar imagen por defecto</p></div>
              <div className="col-span-2"><div className="flex items-center gap-2"><input type="checkbox" id="available" checked={formData.available} onChange={(e) => setFormData({ ...formData, available: e.target.checked })} className="h-4 w-4" /><Label htmlFor="available" className="cursor-pointer">Producto visible en el menú</Label></div></div>
            </div>
            <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-300/20 dark:bg-emerald-500/5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-2"><Utensils className="mt-1 h-5 w-5 text-emerald-700" /><div><h3 className="font-black text-slate-900 dark:text-white">Ficha detallada e ingredientes</h3><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Pega un borrador creado aquí en ChatGPT. Confirma ingredientes y alérgenos con la receta o etiqueta real antes de publicar.</p></div></div>
                <div className="w-full space-y-2 sm:w-auto sm:min-w-[300px]">
                  <Button type="button" variant="outline" onClick={() => void copyChatGptInstructions()} className="w-full"><Utensils className="mr-2 h-4 w-4"/>Copiar instrucciones para ChatGPT</Button>
                  <Textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={3} placeholder="Pega aquí el JSON del borrador de ChatGPT…" />
                  <Button type="button" variant="outline" onClick={applyPastedNutritionDraft} disabled={!draftText.trim()} className="w-full">Aplicar borrador pegado</Button>
                </div>
              </div>
              {nutritionForm.nutrition_source === 'ai_draft' && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><p className="font-black">Borrador de IA · no verificado</p><p>La IA puede omitir o inferir ingredientes. No uses esta sugerencia como garantía para una alergia. Contrasta cada ingrediente con la receta o etiqueta real.</p>{aiWarnings.map((warning) => <p key={warning} className="mt-1">• {warning}</p>)}</div>}
              <label className="block space-y-1"><span className="text-xs font-bold text-slate-700 dark:text-slate-200">Notas reales de receta / etiqueta (ayudan a la IA)</span><Textarea value={nutritionForm.recipe_notes} onChange={(e) => setNutritionForm((current) => ({...current,recipe_notes:e.target.value,nutrition_source:current.nutrition_source==='ai_draft'?'ai_draft':'manual',ingredients_verified:false,nutrition_verified:false}))} rows={2} placeholder="Ej. pan de trigo, carne de res, queso, salsas y posibles subingredientes del proveedor" /></label>
              <label className="block space-y-1"><span className="text-xs font-bold text-slate-700 dark:text-slate-200">Descripción detallada</span><Textarea value={nutritionForm.detailed_description} onChange={(e) => setNutritionForm((current) => ({...current,detailed_description:e.target.value,ingredients_verified:false}))} rows={3} placeholder="Descripción completa del alimento, preparación y porción" /></label>
              <label className="block space-y-1"><span className="text-xs font-bold text-slate-700 dark:text-slate-200">Ingredientes (separados por punto y coma)</span><Textarea value={nutritionForm.ingredients} onChange={(e) => setNutritionForm((current) => ({...current,ingredients:e.target.value,ingredients_verified:false,nutrition_source:current.nutrition_source==='ai_draft'?'ai_draft':'manual'}))} rows={3} required={formData.available} placeholder="Harina de trigo; leche; huevo; queso; aceite vegetal…" /><p className="text-xs text-slate-500 dark:text-slate-400">Incluye todos los ingredientes y subingredientes tal como aparecen en la receta o empaque. Esta lista se usa para comparar bloqueos por ingrediente.</p></label>
              <label className="block space-y-1"><span className="text-xs font-bold text-slate-700 dark:text-slate-200">Alérgenos (separados por coma)</span><Input value={nutritionForm.allergens} onChange={(e) => setNutritionForm((current) => ({...current,allergens:e.target.value,nutrition_verified:false}))} placeholder="Trigo, leche, huevo, soya…" /></label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{([['calories','Calorías kcal'],['protein_g','Proteína g'],['carbohydrates_g','Carbohidratos g'],['fat_g','Grasa g'],['fiber_g','Fibra g']] as const).map(([key,label]) => <label key={key} className="space-y-1"><span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{label}</span><Input type="number" min="0" step="0.1" value={nutritionForm[key]} onChange={(e) => setNutritionForm((current) => ({...current,[key]:e.target.value,nutrition_verified:false}))} /></label>)}</div>
              <div className="flex flex-wrap gap-4 text-sm font-semibold text-slate-700 dark:text-slate-200"><label className="flex items-center gap-2"><input type="checkbox" checked={nutritionForm.vegetarian} onChange={(e) => setNutritionForm((current) => ({...current,vegetarian:e.target.checked}))} className="h-4 w-4"/>Vegetariano</label><label className="flex items-center gap-2"><input type="checkbox" checked={nutritionForm.healthy_choice} onChange={(e) => setNutritionForm((current) => ({...current,healthy_choice:e.target.checked}))} className="h-4 w-4"/>Opción saludable</label></div>
              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><label className="flex items-start gap-2 text-xs leading-5 text-slate-700 dark:text-slate-200"><input type="checkbox" checked={nutritionForm.ingredients_verified} onChange={(e) => setNutritionForm((current) => ({...current,ingredients_verified:e.target.checked,nutrition_source:current.nutrition_source==='ai_draft'?'ai_draft':'manual'}))} className="mt-1 h-4 w-4"/><span><strong>He verificado toda la lista de ingredientes</strong> usando la receta real o el empaque del proveedor. No basta con aceptar la respuesta de IA.</span></label><label className="flex items-start gap-2 text-xs leading-5 text-slate-700 dark:text-slate-200"><input type="checkbox" checked={nutritionForm.nutrition_verified} onChange={(e) => setNutritionForm((current) => ({...current,nutrition_verified:e.target.checked}))} className="mt-1 h-4 w-4"/><span>He verificado las cifras nutricionales contra una ficha o etiqueta fiable. Si son estimaciones de IA, deja esta casilla desmarcada.</span></label></div>
              {!nutritionForm.ingredients_verified && <p className="flex items-start gap-2 text-xs leading-5 text-amber-800 dark:text-amber-200"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/>No publiques este alimento hasta verificar sus ingredientes. Puedes guardarlo oculto mientras completas la ficha.</p>}
            </section>
            <div className="flex gap-3 pt-4"><Button type="submit" disabled={savingNutrition} className="flex-1 bg-green-600 text-white hover:bg-green-700">{savingNutrition ? 'Guardando…' : editingProduct ? 'Guardar Cambios' : 'Agregar Producto'}</Button><Button type="button" disabled={savingNutrition} onClick={() => setIsDialogOpen(false)} variant="outline" className="flex-1">Cancelar</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
