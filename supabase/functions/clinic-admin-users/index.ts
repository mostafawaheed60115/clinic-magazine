import { requireActiveAdmin } from "../_shared/auth.ts";
import { errorResponse, isAllowedOrigin, jsonResponse } from "../_shared/http.ts";

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const MAX_NAME = 160;
const MAX_PHONE = 64;
const MAX_JSON_BYTES = 128 * 1024;

function text(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

function validUsername(value: unknown): string | null {
  const username = text(value)?.toLowerCase() ?? "";
  return USERNAME.test(username) ? username : null;
}

function validPassword(value: unknown): string | null {
  const password = typeof value === "string" ? value : "";
  return password.length >= 8 && password.length <= 256 ? password : null;
}

function emailFor(username: string): string {
  return `${username}@users.clinic.invalid`;
}

function failure(request: Request, error: unknown): Response {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  const map: Record<string, [number, string]> = {
    AUTH_REQUIRED: [401, "Authentication is required."],
    AUTH_INVALID: [401, "The access token is invalid or expired."],
    AUTH_FORBIDDEN: [403, "Administrator access is required."],
    AUTH_LOOKUP_FAILED: [503, "Authorization lookup failed."],
    INVALID_JSON: [400, "Request JSON is invalid."],
    INVALID_ACTION: [400, "The requested user action is invalid."],
    INVALID_USERNAME: [400, "Username must be 3–40 lowercase letters, numbers, dots, underscores, or hyphens."],
    INVALID_NAME: [400, "A display name is required."],
    INVALID_PASSWORD: [400, "Password must contain 8–256 characters."],
    INVALID_USER_ID: [400, "A valid user id is required."],
    INVALID_REVISION: [400, "A current revision is required."],
    USERNAME_TAKEN: [409, "That username is already in use."],
    USER_NOT_FOUND: [404, "The user was not found."],
    REVISION_CONFLICT: [409, "The user changed elsewhere. Reload and try again."],
    SELF_DISABLE: [400, "You cannot disable your own account."],
    ADMIN_MEMBERSHIP_PROTECTED: [409, "Administrator membership changes are not available here."],
    INTERNAL_ERROR: [500, "The request could not be completed."],
  };
  const [status, message] = map[code] ?? map.INTERNAL_ERROR;
  return errorResponse(request, status, code in map ? code : "INTERNAL_ERROR", message);
}

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_JSON_BYTES) throw new Error("INVALID_JSON");
    const reader = request.body?.getReader();
    if (!reader) throw new Error("INVALID_JSON");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_JSON_BYTES) throw new Error("INVALID_JSON");
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("INVALID_JSON");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_JSON") throw error;
    throw new Error("INVALID_JSON");
  }
}

async function listUsers(request: Request, adminClient: any, input: Record<string, unknown>): Promise<Response> {
  const page = Number.isInteger(input.page) && (input.page as number) >= 0 ? input.page as number : 0;
  const pageSize = Number.isInteger(input.pageSize) && (input.pageSize as number) >= 1 && (input.pageSize as number) <= 100
    ? input.pageSize as number
    : 100;
  const from = page * pageSize;
  const { data, error } = await adminClient
    .from("users")
    .select("id, username, name, phone, active, revision, create_date")
    .order("username", { ascending: true })
    .range(from, from + pageSize - 1);
  if (error) throw new Error("INTERNAL_ERROR");
  return jsonResponse(request, { ok: true, users: data ?? [], page, pageSize, hasMore: (data?.length ?? 0) === pageSize });
}

async function createUser(request: Request, adminClient: any, input: Record<string, unknown>): Promise<Response> {
  const username = validUsername(input.username);
  const name = text(input.name);
  const password = validPassword(input.password);
  if (!username) throw new Error("INVALID_USERNAME");
  if (!name || name.length > MAX_NAME) throw new Error("INVALID_NAME");
  if (!password) throw new Error("INVALID_PASSWORD");
  const phone = text(input.phone);
  if (phone && phone.length > MAX_PHONE) throw new Error("INVALID_JSON");
  if (input.active !== undefined && typeof input.active !== "boolean") throw new Error("INVALID_JSON");
  const active = input.active === undefined ? true : input.active === true;

  const { data: created, error: authError } = await adminClient.auth.admin.createUser({
    email: emailFor(username),
    password,
    email_confirm: true,
  });
  if (authError || !created.user) {
    if (authError?.code === "email_exists" || authError?.message.toLowerCase().includes("already")) {
      throw new Error("USERNAME_TAKEN");
    }
    throw new Error("INTERNAL_ERROR");
  }

  const { data: profile, error: profileError } = await adminClient
    .from("users")
    .insert({ id: created.user.id, username, name, phone, active })
    .select("id, username, name, phone, active, revision, create_date")
    .single();
  if (profileError || !profile) {
    // Remove only the auth user created by this request; no pre-existing object
    // can be affected by a failed profile insert.
    await adminClient.auth.admin.deleteUser(created.user.id);
    if (profileError?.code === "23505") throw new Error("USERNAME_TAKEN");
    throw new Error("INTERNAL_ERROR");
  }
  return jsonResponse(request, { ok: true, user: profile }, 201);
}

async function editUser(request: Request, adminClient: any, actorId: string, input: Record<string, unknown>): Promise<Response> {
  const userId = text(input.userId);
  const revision = input.expectedRevision;
  if (!userId) throw new Error("INVALID_USER_ID");
  if (!Number.isInteger(revision) || (revision as number) < 1) throw new Error("INVALID_REVISION");
  const active = input.active;
  if (active !== undefined && typeof active !== "boolean") throw new Error("INVALID_JSON");
  if (userId === actorId && active === false) throw new Error("SELF_DISABLE");

  if (active === false) {
    const { data: targetAdmin, error: targetError } = await adminClient.from("admin").select("id").eq("id", userId).maybeSingle();
    if (targetError) throw new Error("AUTH_LOOKUP_FAILED");
    if (targetAdmin) throw new Error("ADMIN_MEMBERSHIP_PROTECTED");
  }

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = text(input.name);
    if (!name || name.length > MAX_NAME) throw new Error("INVALID_NAME");
    patch.name = name;
  }
  if (input.phone !== undefined) {
    const phone = text(input.phone);
    if (phone && phone.length > MAX_PHONE) throw new Error("INVALID_JSON");
    patch.phone = phone;
  }
  if (active !== undefined) patch.active = active;
  if (!Object.keys(patch).length) throw new Error("INVALID_JSON");
  patch.revision = (revision as number) + 1;

  const { data, error } = await adminClient
    .from("users")
    .update(patch)
    .eq("id", userId)
    .eq("revision", revision)
    .select("id, username, name, phone, active, revision, create_date")
    .maybeSingle();
  if (error) throw new Error("INTERNAL_ERROR");
  if (!data) throw new Error("REVISION_CONFLICT");
  return jsonResponse(request, { ok: true, user: data });
}

async function resetPassword(request: Request, adminClient: any, input: Record<string, unknown>): Promise<Response> {
  const userId = text(input.userId);
  const password = validPassword(input.password);
  if (!userId) throw new Error("INVALID_USER_ID");
  if (!password) throw new Error("INVALID_PASSWORD");
  const { data: target, error: targetError } = await adminClient.from("users").select("id").eq("id", userId).maybeSingle();
  if (targetError) throw new Error("INTERNAL_ERROR");
  if (!target) throw new Error("USER_NOT_FOUND");
  const { error } = await adminClient.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error("INTERNAL_ERROR");
  return jsonResponse(request, { ok: true, userId });
}

Deno.serve(async (request) => {
  if (!isAllowedOrigin(request)) return errorResponse(request, 403, "ORIGIN_FORBIDDEN", "Origin is not allowed.");
  if (request.method === "OPTIONS") return jsonResponse(request, { ok: true });
  if (request.method !== "POST") return errorResponse(request, 405, "METHOD_NOT_ALLOWED", "Use POST.");

  try {
    const { user, adminClient } = await requireActiveAdmin(request);
    const input = await body(request);
    const action = input.action;
    if (action === "list") return await listUsers(request, adminClient, input);
    if (action === "create") return await createUser(request, adminClient, input);
    if (action === "edit" || action === "update" || action === "set_active") return await editUser(request, adminClient, user.id, input);
    if (action === "reset_password") return await resetPassword(request, adminClient, input);
    throw new Error("INVALID_ACTION");
  } catch (error) {
    return failure(request, error);
  }
});
