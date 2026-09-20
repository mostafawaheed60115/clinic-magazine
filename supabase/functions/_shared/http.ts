const DEVELOPMENT_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);

export function allowedOrigins(): Set<string> {
  const configured = Deno.env
    .get("ALLOWED_ORIGINS")
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Production must set ALLOWED_ORIGINS. The fallback keeps local Vite work
  // usable while remaining limited to the two loopback development origins.
  return new Set(configured?.length ? configured : DEVELOPMENT_ORIGINS);
}

export function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    // supabase-js includes x-client-info on every browser function request.
    // Without it the preflight is rejected even when the origin is trusted.
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  });
  const origin = request.headers.get("origin");
  if (origin && allowedOrigins().has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

export function jsonResponse(
  request: Request,
  body: unknown,
  status = 200,
): Response {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

export function errorResponse(
  request: Request,
  status: number,
  code: string,
  message: string,
): Response {
  return jsonResponse(request, { ok: false, error: { code, message } }, status);
}

export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || allowedOrigins().has(origin);
}
