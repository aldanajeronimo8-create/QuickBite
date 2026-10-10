import { requireSupabaseClient } from '../lib/supabase';

export interface NutritionAiSuggestion {
  detailed_description: string;
  ingredients: string[];
  allergens: string[];
  calories: number | null;
  protein_g: number | null;
  carbohydrates_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  vegetarian: boolean;
  healthy_choice: boolean;
  warnings: string[];
}
export interface NutritionAiInput {
  name: string;
  category?: string;
  description?: string;
  recipe_notes?: string;
}
export async function suggestNutrition(input: NutritionAiInput): Promise<NutritionAiSuggestion> {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Tu sesión expiró. Inicia sesión como administrador nuevamente.');
  const response = await fetch('/api/nutrition/suggest', {
    method: 'POST',
    headers: { Authorization: \`Bearer \${token}\`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({})) as {
    error?: unknown;
    suggestion?: NutritionAiSuggestion;
  };
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'No se pudo generar el borrador nutricional.');
  if (!payload.suggestion || !Array.isArray(payload.suggestion.ingredients)) {
    throw new Error('La IA devolvió una ficha incompleta. Vuelve a intentarlo.');
  }
  return payload.suggestion;
}
