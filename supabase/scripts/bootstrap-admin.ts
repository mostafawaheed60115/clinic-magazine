// Customer-run alternative to the temporary bootstrap Edge Function.
// Supply every value through the environment; never commit credentials.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const required = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const username = required("CLINIC_BOOTSTRAP_USERNAME").toLowerCase();
const password = required("CLINIC_BOOTSTRAP_PASSWORD");
const name = required("CLINIC_BOOTSTRAP_NAME");
if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) throw new Error("Invalid username");
if (password.length < 8 || password.length > 256) throw new Error("Invalid password length");

const supabase = createClient(
  required("SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const { count, error: countError } = await supabase.from("admin").select("id", { count: "exact", head: true });
if (countError) throw countError;
if ((count ?? 0) > 0) throw new Error("An administrator already exists");

const { data: created, error: authError } = await supabase.auth.admin.createUser({
  email: `${username}@users.clinic.invalid`,
  password,
  email_confirm: true,
});
if (authError || !created.user) throw authError ?? new Error("Could not create Auth user");

const { error: profileError } = await supabase.from("users").insert({
  id: created.user.id,
  username,
  name,
  phone: Deno.env.get("CLINIC_BOOTSTRAP_PHONE")?.trim() || null,
  active: true,
});
if (profileError) {
  await supabase.auth.admin.deleteUser(created.user.id);
  throw profileError;
}
const { error: adminError } = await supabase.from("admin").insert({ id: created.user.id });
if (adminError) {
  await supabase.from("users").delete().eq("id", created.user.id);
  await supabase.auth.admin.deleteUser(created.user.id);
  throw adminError;
}
console.log(`Created Clinic administrator ${username} (${created.user.id})`);
