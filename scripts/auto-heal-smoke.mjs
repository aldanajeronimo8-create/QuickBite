const productionUrl = process.env.QUICKBITE_PRODUCTION_URL;
const healthUrl = process.env.QUICKBITE_HEALTH_URL;
const healthToken = process.env.QUICKBITE_HEALTH_TOKEN;

if (!productionUrl) throw new Error('QUICKBITE_PRODUCTION_URL is required.');

async function checkUrl(url, headers = {}) {
  const controller = new globalThis.AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await globalThis.fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers,
      signal: controller.signal,
    });
    const body = await response.text();
    return { status: response.status, body };
  } finally {
    globalThis.clearTimeout(timer);
  }
}

const production = await checkUrl(productionUrl);
const titleOk = /<title>\s*QuickBite\s*<\/title>/i.test(production.body);
if (production.status !== 200 || !titleOk) {
  throw new Error(`Production smoke check failed: HTTP ${production.status}; title=${titleOk ? 'ok' : 'missing'}.`);
}

console.log(`Production smoke check OK: HTTP ${production.status}.`);

if (healthUrl) {
  const headers = healthToken ? { 'x-quickbite-health-token': healthToken } : {};
  const health = await checkUrl(healthUrl, headers);
  if (health.status !== 200) {
    throw new Error(`Supabase health check failed: HTTP ${health.status}.`);
  }
  console.log(`Supabase health check OK: HTTP ${health.status}.`);
} else {
  console.log('Supabase health URL not configured; frontend smoke check remains enforced.');
}
