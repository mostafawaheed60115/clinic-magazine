import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

type AdminContext = {
  user: User;
  adminClient: SupabaseClient;
};

function envOrThrow(...names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  throw new Error(`Missing Supabase function secret: ${names.join(" or ")}`);
}

export function serviceClient(): SupabaseClient {
  return createClient(
    envOrThrow("SUPABASE_URL"),
    envOrThrow("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function requireActiveAdmin(
  request: Request,
): Promise<AdminContext> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("AUTH_REQUIRED");

  const token = match[1];
  const url = envOrThrow("SUPABASE_URL");
  const publishableKey = envOrThrow(
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
  );
  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } =
    await userClient.auth.getUser(token);
  if (userError || !userData.user) throw new Error("AUTH_INVALID");

  const adminClient = serviceClient();
  const { data: profile, error: profileError } = await adminClient
    .from("users")
    .select("id, active")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) throw new Error("AUTH_LOOKUP_FAILED");
  if (!profile?.active) throw new Error("AUTH_FORBIDDEN");

  const { data: admin, error: adminError } = await adminClient
    .from("admin")
    .select("id")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (adminError) throw new Error("AUTH_LOOKUP_FAILED");
  if (!admin) throw new Error("AUTH_FORBIDDEN");

  return { user: userData.user, adminClient };
}
