import { createClient } from '@supabase/supabase-js';

type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};
type ApiResponse = {
  status: (code: number) => ApiResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};
type Suggestion = {
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
};
const MODEL = process.env.AI_GATEWAY_MODEL || 'google/gemini-2.5-flash-lite';

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function send(res: ApiResponse, status: number, body: unknown) {
  res.status(status).json(body);
}
function parseBody(body: unknown): Record<string, unknown> | null {
  if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  if (typeof body === 'string') {
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { return null; }
  }
  return null;
}
function numeric(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value * 10) / 10 : null;
}
function list(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().slice(0, maxLength)).filter(Boolean))].slice(0, maxItems);
}
function toSuggestion(value: unknown): Suggestion | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const ingredients = list(row.ingredients, 40, 100);
  const detailed = text(row.detailed_description, 1200);
  if (!detailed || ingredients.length === 0) return null;
  return {
    detailed_description: detailed,
    ingredients,
    allergens: list(row.allergens, 30, 80),
    calories: numeric(row.calories),
    protein_g: numeric(row.protein_g),
    carbohydrates_g: numeric(row.carbohydrates_g),
    fat_g: numeric(row.fat_g),
    fiber_g: numeric(row.fiber_g),
    vegetarian: row.vegetarian === true,
    healthy_choice: row.healthy_choice === true,
    warnings: list(row.warnings, 8, 240),
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Método no permitido.' });
  }

  const authorization = req.headers.authorization;
  const token = (Array.isArray(authorization) ? authorization[0] : authorization)?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return send(res, 401, { error: 'Inicia sesión como administrador para usar la sugerencia con IA.' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return send(res, 503, { error: 'La verificación de sesión no está configurada en el servidor.' });

  try {
    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: 'Bearer ' + token } },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return send(res, 401, { error: 'La sesión expiró. Inicia sesión nuevamente.' });

    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('role,active').eq('id', userData.user.id).maybeSingle();
    if (profileError || !profile || profile.active !== true || !['admin', 'both'].includes(profile.role)) {
      return send(res, 403, { error: 'Solo un administrador activo puede generar la ficha de un alimento.' });
    }

    const input = parseBody(req.body);
    if (!input) return send(res, 400, { error: 'El cuerpo de la solicitud no es válido.' });
    const name = text(input.name, 180);
    const category = text(input.category, 100);
    const description = text(input.description, 1000);
    const recipeNotes = text(input.recipe_notes, 1600);
    if (name.length < 2) return send(res, 400, { error: 'Escribe el nombre del alimento.' });

    const runtimeOidcHeader = req.headers['x-vercel-oidc-token'];
    const runtimeOidcToken = Array.isArray(runtimeOidcHeader) ? runtimeOidcHeader[0] : runtimeOidcHeader;
    const gatewayToken = runtimeOidcToken || process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY;
    if (!gatewayToken) return send(res, 503, { error: 'La IA no está habilitada para este despliegue. Configura Vercel AI Gateway en el servidor.' });

    const system = [
      'Eres un asistente que prepara BORRADORES de fichas de alimentos escolares para revisión humana.',
      'Devuelve un JSON válido, sin markdown, con las claves: detailed_description, ingredients, allergens, calories, protein_g, carbohydrates_g, fat_g, fiber_g, vegetarian, healthy_choice, warnings.',
      'ingredients debe ser una lista de cadenas cortas, un ingrediente o subingrediente por elemento, en español.',
      'allergens debe ser una lista de alérgenos probables claramente indicados como posibles si no hay receta/etiqueta.',
      'Nunca inventes que un alimento está libre de alérgenos. No afirmes ausencia segura de trazas.',
      'Si no hay receta, etiqueta o tamaño de porción, macros/calorías deben ser null; si una cifra es solo una estimación, añade una advertencia.',
      'No afirmes seguridad médica, diagnósticos ni que un alimento es seguro para una alergia. healthy_choice solo es una valoración general provisional.',
      'Incluye en warnings que el usuario debe contrastar ingredientes y alérgenos con receta real o etiqueta antes de publicar.',
      'Las sugerencias son borradores de IA y pueden contener errores.',
    ].join(' ');

    const upstream = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + gatewayToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 1300,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify({ name, category, current_description: description, recipe_or_label_notes: recipeNotes }) },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!upstream.ok) {
      if (upstream.status === 401 || upstream.status === 403) {
        return send(res, 503, { error: 'El servidor de IA rechazó la autenticación. Revisa la conexión de AI Gateway del proyecto.' });
      }
      if (upstream.status === 402) return send(res, 503, { error: 'AI Gateway no tiene crédito o cuota disponible para generar la ficha.' });
      if (upstream.status === 429) return send(res, 503, { error: 'La IA está ocupada. Espera un momento y vuelve a intentarlo.' });
      return send(res, 502, { error: 'El proveedor de IA no pudo generar la ficha. Inténtalo otra vez.' });
    }

    const response: unknown = await upstream.json();
    if (!response || typeof response !== 'object' || !('choices' in response)) {
      return send(res, 502, { error: 'La IA devolvió una respuesta con formato inesperado.' });
    }
    const choices = (response as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
    const content = choices?.[0]?.message?.content;
    if (typeof content !== 'string') return send(res, 502, { error: 'La IA no devolvió el borrador esperado.' });
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { return send(res, 502, { error: 'La IA devolvió JSON inválido. Vuelve a intentarlo.' }); }
    const suggestion = toSuggestion(parsed);
    if (!suggestion) return send(res, 502, { error: 'La IA no incluyó una descripción e ingredientes utilizables.' });

    return send(res, 200, {
      suggestion,
      source: 'ai_draft',
      verified: false,
      model: MODEL,
      warning: 'Borrador no verificado. Contrasta cada ingrediente y alérgeno con la receta o etiqueta real antes de publicarlo.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/timeout|aborted/i.test(message)) return send(res, 504, { error: 'La IA tardó demasiado. Vuelve a intentarlo.' });
    return send(res, 500, { error: 'No se pudo generar la ficha. Revisa la conexión e inténtalo nuevamente.' });
  }
}
