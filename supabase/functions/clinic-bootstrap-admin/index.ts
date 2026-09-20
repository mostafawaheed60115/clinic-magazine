// One-time bootstrap helper. Deploy this only with verify_jwt=false, a random
// CLINIC_BOOTSTRAP_TOKEN_SHA256 secret, and CLINIC_BOOTSTRAP_ENABLED=true.
// Remove or replace it with a 410 stub immediately after the first admin exists.
import { createClient } from "@supabase/supabase-js";
import {
  errorResponse,
  isAllowedOrigin,
  jsonResponse,
} from "../_shared/http.ts";

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,39}$/;

function error(
  request: Request,
  status: number,
  code: string,
  message: string,
): Response {
  return errorResponse(request, status, code, message);
}

function secret(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`MISSING_${name}`);
  return value;
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= left[index] ^ right[index];
  return difference === 0;
}

async function authorized(request: Request): Promise<boolean> {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  const expectedHex = secret("CLINIC_BOOTSTRAP_TOKEN_SHA256").toLowerCase();
  if (!token || !/^[a-f0-9]{64}$/.test(expectedHex)) return false;
  const expected = Uint8Array.from(
    expectedHex.match(/.{2}/g)!.map((part) => parseInt(part, 16)),
  );
  return equalBytes(await digest(token), expected);
}

Deno.serve(async (request) => {
  if (!isAllowedOrigin(request))
    return error(request, 403, "ORIGIN_FORBIDDEN", "Origin is not allowed.");
  if (request.method === "OPTIONS") return jsonResponse(request, { ok: true });
  if (request.method !== "POST")
    return error(request, 405, "METHOD_NOT_ALLOWED", "Use POST.");
  if (Deno.env.get("CLINIC_BOOTSTRAP_ENABLED") !== "true") {
    return error(request, 410, "BOOTSTRAP_DISABLED", "Bootstrap is disabled.");
  }

  try {
    if (!(await authorized(request)))
      return error(
        request,
        401,
        "BOOTSTRAP_UNAUTHORIZED",
        "Bootstrap token is invalid.",
      );
    const input = await request.json();
    const username =
      typeof input.username === "string"
        ? input.username.trim().toLowerCase()
        : "";
    const name = typeof input.name === "string" ? input.name.trim() : "";
    const password = typeof input.password === "string" ? input.password : "";
    if (
      !USERNAME.test(username) ||
      !name ||
      name.length > 160 ||
      password.length < 8 ||
      password.length > 256
    ) {
      return error(
        request,
        400,
        "INVALID_BOOTSTRAP_INPUT",
        "Bootstrap fields are invalid.",
      );
    }

    const url = secret("SUPABASE_URL");
    const serviceKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_SECRET_KEY");
    if (!serviceKey)
      return error(
        request,
        503,
        "BOOTSTRAP_NOT_CONFIGURED",
        "Bootstrap is not configured.",
      );
    const adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { count, error: countError } = await adminClient
      .from("admin")
      .select("id", { count: "exact", head: true });
    if (countError)
      return error(
        request,
        503,
        "BOOTSTRAP_LOOKUP_FAILED",
        "Bootstrap lookup failed.",
      );
    if ((count ?? 0) > 0)
      return error(
        request,
        409,
        "ADMIN_ALREADY_EXISTS",
        "An administrator already exists.",
      );

    const { data: created, error: authError } =
      await adminClient.auth.admin.createUser({
        email: `${username}@users.clinic.invalid`,
        password,
        email_confirm: true,
      });
    if (authError || !created.user)
      return error(
        request,
        409,
        "BOOTSTRAP_USER_CREATE_FAILED",
        "The administrator could not be created.",
      );

    const { error: profileError } = await adminClient.from("users").insert({
      id: created.user.id,
      username,
      name,
      phone: typeof input.phone === "string" ? input.phone.trim() : null,
      active: true,
    });
    if (profileError) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      return error(
        request,
        409,
        "BOOTSTRAP_PROFILE_FAILED",
        "The administrator profile could not be created.",
      );
    }
    const { error: adminError } = await adminClient
      .from("admin")
      .insert({ id: created.user.id });
    if (adminError) {
      await adminClient.from("users").delete().eq("id", created.user.id);
      await adminClient.auth.admin.deleteUser(created.user.id);
      return error(
        request,
        409,
        "BOOTSTRAP_ADMIN_FAILED",
        "Administrator membership could not be created.",
      );
    }
    return jsonResponse(
      request,
      { ok: true, user: { id: created.user.id, username, name } },
      201,
    );
  } catch {
    return error(
      request,
      400,
      "BOOTSTRAP_INVALID_REQUEST",
      "Bootstrap request is invalid.",
    );
  }
});
