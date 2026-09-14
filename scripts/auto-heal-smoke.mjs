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
const normalizedBody = production.body.replace(/\s+/g, ' ').trim();
const titleMatch = normalizedBody.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
const isQuickBiteTitle = /^QuickBite(?:\s*[|\-:]|$)/i.test(title);
const hasAppShell = /(?:id=["']root["']|id=["']app["']|<script[^>]+type=["']module["'])/i.test(normalizedBody);

// A Vercel SPA may return a valid app shell without the exact literal title
// in the initial HTML. HTTP 200 plus a recognizable app shell is sufficient
// to avoid false production-smoke failures.
if (production.status !== 200 || (!isQuickBiteTitle && !hasAppShell)) {
  throw new Error(`Production smoke check failed: HTTP ${production.status}; title=${title || 'missing'}; appShell=${hasAppShell ? 'ok' : 'missing'}.`);
}

console.log(`Production smoke check OK: HTTP ${production.status}; title=${title || 'not provided'}; appShell=${hasAppShell ? 'ok' : 'not detected'}.`);

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
