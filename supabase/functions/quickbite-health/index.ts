import { createClient } from 'npm:@supabase/supabase-js';

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function response(body: Record<string, unknown>, status: number, origin?: string | null) {
  const headers = new Headers(jsonHeaders);
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return new Response(JSON.stringify(body), { status, headers });
}

function allowedOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

function hasValidHealthToken(request: Request) {
  const expected = Deno.env.get('HEALTH_CHECK_TOKEN');
  return !expected || request.headers.get('x-quickbite-health-token') === expected;
}

async function recordHealth(
  supabase: ReturnType<typeof createClient>,
  status: HealthStatus,
  latencyMs: number,
  details: Record<string, unknown>,
) {
  const { error } = await supabase.rpc('record_system_health_check', {
    p_service: 'supabase_database',
    p_status: status,
    p_latency_ms: latencyMs,
    p_details: details,
  });
  return error;
}

Deno.serve(async (request) => {
  const origin = allowedOrigin(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...jsonHeaders,
        ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
        'Access-Control-Allow-Headers': 'x-quickbite-health-token',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Max-Age': '600',
      },
    });
  }
  if (request.method !== 'GET') return response({ status: 'method_not_allowed' }, 405, origin);
  if (!hasValidHealthToken(request)) return response({ status: 'unauthorized' }, 401, origin);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    // Never reveal configuration names or values to the caller.
    return response({ status: 'unhealthy', service: 'quickbite' }, 503, origin);
  }

  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const startedAt = performance.now();
  const { error: databaseError } = await supabase
    .from('products')
    .select('id', { head: true })
    .limit(1);
  const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));

  if (databaseError) {
    await recordHealth(supabase, 'unhealthy', latencyMs, { check: 'database_query', result: 'failed' });
    return response({
      status: 'unhealthy',
      service: 'supabase_database',
      latency_ms: latencyMs,
      checked_at: new Date().toISOString(),
    }, 503, origin);
  }

  const auditError = await recordHealth(supabase, 'healthy', latencyMs, {
    check: 'database_query',
    result: 'ok',
  });
  if (auditError) {
    return response({
      status: 'degraded',
      service: 'supabase_database',
      latency_ms: latencyMs,
      checked_at: new Date().toISOString(),
    }, 503, origin);
  }

  return response({
    status: 'healthy',
    service: 'supabase_database',
    latency_ms: latencyMs,
    checked_at: new Date().toISOString(),
  }, 200, origin);
});
