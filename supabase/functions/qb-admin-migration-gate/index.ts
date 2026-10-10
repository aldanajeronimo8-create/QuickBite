import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "null",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getKeys() {
  const url = Deno.env.get("SUPABASE_URL");
  const secretMapRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  const publishableMapRaw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  const secret = secretMapRaw ? JSON.parse(secretMapRaw).default : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publishable = publishableMapRaw ? JSON.parse(publishableMapRaw).default : Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !secret || !publishable) throw new Error("Required Supabase runtime configuration is unavailable.");
  return { url, secret, publishable };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  if (req.method !== "GET" || url.pathname.replace(/\/$/, "").split("/").pop() !== "status") {
    return json({ error: "Not found" }, 404);
  }

  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Authentication required" }, 401);

  try {
    const { url: projectUrl, secret } = getKeys();
    const admin = createClient(projectUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Invalid session" }, 401);

    const { data: profile, error: profileError } = await admin
      .from("profiles").select("role, active").eq("id", userData.user.id).maybeSingle();
    if (profileError) return json({ error: "Unable to verify administrator permissions" }, 503);
    if (!profile || profile.active !== true || !["admin", "both"].includes(profile.role)) {
      return json({ error: "Administrator access required" }, 403);
    }

    const { count: protectedCount, error: protectedError } = await admin
      .from("protected_admins").select("*", { count: "exact", head: true });
    if (protectedError) return json({ error: "Unable to verify protected-account table" }, 503);

    const { data: userPage, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (usersError) return json({ error: "Unable to verify Auth service" }, 503);

    return json({
      status: "ready_for_review",
      destinationProject: "Quickbite",
      authenticatedAdmin: true,
      protectedAccountRows: protectedCount ?? 0,
      authServiceReachable: Array.isArray(userPage.users),
      sourceConnectionConfigured: Boolean(Deno.env.get("QB_SOURCE_URL") && Deno.env.get("QB_SOURCE_SECRET_KEY")),
      migrationExecuted: false,
      note: "Read-only gate only. No accounts, credentials, roles, or source data were changed.",
    });
  } catch (_error) {
    return json({ error: "Server configuration is incomplete" }, 503);
  }
});