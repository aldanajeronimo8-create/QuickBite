import { createClient } from "npm:@supabase/supabase-js@2";

const BASE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Vary": "Origin",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function allowedOrigins(): Set<string> {
  const raw = Deno.env.get("QB_ADMIN_ALLOWED_ORIGINS") ?? "";
  const origins = new Set<string>();
  for (const value of raw.split(",")) {
    const candidate = value.trim();
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if ((parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.origin === candidate) {
        origins.add(candidate);
      }
    } catch {
      // Ignore malformed entries and fail closed.
    }
  }
  return origins;
}

function responseHeaders(req: Request): Headers | null {
  const headers = new Headers(BASE_HEADERS);
  const origin = req.headers.get("Origin");
  if (!origin) return headers;
  if (origin === "null" || !allowedOrigins().has(origin)) return null;
  headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function json(req: Request, body: Record<string, unknown>, status = 200): Response {
  const headers = responseHeaders(req);
  if (!headers) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin" }),
    });
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function getKeys() {
  const url = Deno.env.get("SUPABASE_URL");
  let secret: string | undefined;
  const secretMapRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretMapRaw) {
    try {
      const parsed = JSON.parse(secretMapRaw);
      secret = typeof parsed.default === "string" ? parsed.default : undefined;
    } catch {
      throw new Error("Secret key configuration is invalid.");
    }
  }
  secret ??= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) throw new Error("Required server configuration is unavailable.");
  return { url, secret };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    const headers = responseHeaders(req);
    if (!headers) return new Response(null, { status: 403, headers: { "Vary": "Origin" } });
    return new Response(null, { status: 204, headers });
  }

  const url = new URL(req.url);
  if (req.method !== "GET" || url.pathname.replace(/\/$/, "").split("/").pop() !== "status") {
    return json(req, { error: "Not found" }, 404);
  }

  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(req, { error: "Authentication required" }, 401);

  try {
    const { url: projectUrl, secret } = getKeys();
    const admin = createClient(projectUrl, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json(req, { error: "Invalid session" }, 401);

    const { data: profile, error: profileError } = await admin
      .from("profiles").select("role, active").eq("id", userData.user.id).maybeSingle();
    if (profileError) return json(req, { error: "Unable to verify administrator permissions" }, 503);
    if (!profile || profile.active !== true || !["admin", "both"].includes(profile.role)) {
      return json(req, { error: "Administrator access required" }, 403);
    }

    const { count: protectedCount, error: protectedError } = await admin
      .from("protected_admins").select("*", { count: "exact", head: true });
    if (protectedError) return json(req, { error: "Unable to verify protected-account table" }, 503);

    const { data: userPage, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (usersError) return json(req, { error: "Unable to verify Auth service" }, 503);

    return json(req, {
      status: "ready_for_review",
      destinationProject: "Quickbite",
      authenticatedAdmin: true,
      protectedAccountRows: protectedCount ?? 0,
      authServiceReachable: Array.isArray(userPage.users),
      allowedOriginsConfigured: allowedOrigins().size > 0,
      sourceConnectionConfigured: Boolean(Deno.env.get("QB_SOURCE_URL") && Deno.env.get("QB_SOURCE_SECRET_KEY")),
      migrationExecuted: false,
      note: "Read-only gate only. No accounts, credentials, roles, or source data were changed.",
    });
  } catch {
    return json(req, { error: "Server configuration is incomplete" }, 503);
  }
});
