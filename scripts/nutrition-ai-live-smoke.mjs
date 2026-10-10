const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL;
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const productionUrl = (process.env.PRODUCTION_URL || process.env.PLAYWRIGHT_BASE_URL || '').replace(/\/+$/, '');

function requireValue(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Nutrition AI smoke test is missing required configuration: ' + label);
  }
  return value.trim();
}

const baseUrl = requireValue(productionUrl, 'PRODUCTION_URL');
const authUrl = requireValue(supabaseUrl, 'VITE_SUPABASE_URL').replace(/\/+$/, '');
const key = requireValue(anonKey, 'VITE_SUPABASE_ANON_KEY');
const email = requireValue(adminEmail, 'PLAYWRIGHT_ADMIN_EMAIL');
const password = requireValue(adminPassword, 'PLAYWRIGHT_ADMIN_PASSWORD');

const signIn = await fetch(authUrl + '/auth/v1/token?grant_type=password', {
  method: 'POST',
  headers: { apikey: key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
  signal: AbortSignal.timeout(20_000),
});
if (!signIn.ok) {
  throw new Error('Nutrition AI live smoke could not authenticate the acceptance administrator (HTTP ' + signIn.status + ').');
}
const session = await signIn.json();
const accessToken = typeof session?.access_token === 'string' ? session.access_token : '';
if (!accessToken) {
  throw new Error('Nutrition AI live smoke authenticated without receiving an access token.');
}

const response = await fetch(baseUrl + '/api/nutrition/suggest', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + accessToken,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'QuickBite — alimento de prueba de aceptación',
    category: 'Prueba automática',
    description: 'Borrador de prueba; no se guardará en el catálogo.',
    recipe_notes: 'Ingredientes declarados para probar la ficha: harina de trigo, leche pasteurizada y huevo. Muestra esos ingredientes como candidatos que debe verificar la cafetería; no afirmes que el alimento está libre de otros alérgenos.',
  }),
  signal: AbortSignal.timeout(45_000),
});

let payload = {};
try { payload = await response.json(); } catch { /* Report only status; never print headers or tokens. */ }
if (!response.ok) {
  const safeMessage = typeof payload?.error === 'string' ? payload.error.slice(0, 400) : 'Respuesta no válida del endpoint.';
  throw new Error('Nutrition AI live smoke failed (HTTP ' + response.status + '): ' + safeMessage);
}

const suggestion = payload?.suggestion;
if (
  payload?.source !== 'ai_draft' ||
  payload?.verified !== false ||
  typeof suggestion?.detailed_description !== 'string' ||
  suggestion.detailed_description.trim().length < 20 ||
  !Array.isArray(suggestion?.ingredients) ||
  suggestion.ingredients.length < 1
) {
  throw new Error('Nutrition AI live smoke received an incomplete or incorrectly marked draft.');
}

console.log('Nutrition AI live smoke: PASS');
console.log('Production endpoint returned an unverified AI draft without writing to the catalog.');
console.log('Model: ' + String(payload.model || 'not reported'));
console.log('Ingredient entries returned: ' + suggestion.ingredients.length);
