import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const started = performance.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ ok: false, error: "server_not_configured" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase.from("system_health_checks").select("id").limit(1);
  const latencyMs = Math.round(performance.now() - started);
  const ok = !error;

  if (ok) {
    await supabase.rpc("record_health_check", {
      p_service: "supabase",
      p_status: "ok",
      p_latency_ms: latencyMs,
      p_details: { source: "quickbite-health" },
    });
  }

  return new Response(JSON.stringify({
    ok,
    service: "supabase",
    status: ok ? "ok" : "down",
    latency_ms: latencyMs,
    checked_at: new Date().toISOString(),
    ...(error ? { error: "database_check_failed" } : {}),
  }), {
    status: ok ? 200 : 503,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
});
