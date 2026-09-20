import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.CLINIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const publishableKey =
  process.env.CLINIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const adminUsername = process.env.CLINIC_ADMIN_USERNAME;
const adminPassword = process.env.CLINIC_ADMIN_PASSWORD;

if (!url || !publishableKey || !adminUsername || !adminPassword)
  throw new Error(
    "Set CLINIC_SUPABASE_URL, CLINIC_SUPABASE_PUBLISHABLE_KEY, CLINIC_ADMIN_USERNAME, and CLINIC_ADMIN_PASSWORD.",
  );

const alias = (username) => `${username}@users.clinic.invalid`;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const client = () =>
  createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

async function signIn(supabase, username, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: alias(username),
    password,
  });
  if (error || !data.user || !data.session)
    throw error || new Error("The smoke user could not sign in");
  return data;
}

async function edge(supabase, functionName, body) {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  });
  if (error) throw error;
  assert(
    data?.ok === true,
    `${functionName} returned an unsuccessful response`,
  );
  return data;
}

async function catalogInsert(supabase, table, record) {
  const { data, error } = await supabase
    .from(table)
    .insert(record)
    .select()
    .single();
  if (error || !data) throw error || new Error(`Could not insert ${table}`);
  return data;
}

async function catalogUpdate(supabase, table, record, patch) {
  const { data, error } = await supabase
    .from(table)
    .update({ ...patch, revision: record.revision + 1 })
    .eq("id", record.id)
    .eq("revision", record.revision)
    .select()
    .maybeSingle();
  if (error || !data)
    throw error || new Error(`${table} revision update failed`);
  return data;
}

async function catalogDelete(supabase, table, record) {
  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq("id", record.id)
    .eq("revision", record.revision)
    .select("id");
  if (error || data?.length !== 1)
    throw error || new Error(`${table} revision delete failed`);
}

async function expectViewerWriteDenied(viewer) {
  const { data, error } = await viewer
    .from("companies")
    .insert({
      id: randomUUID(),
      name: "Clinic smoke denied",
      name_ar: "اختبار مرفوض",
      name_en: "Clinic smoke denied",
      revision: 1,
    })
    .select();
  assert(
    Boolean(error) || !data?.length,
    "Viewer unexpectedly wrote a catalog row",
  );
}

async function expectViewerReadDenied(viewer) {
  const { data, error } = await viewer.from("companies").select("id").limit(1);
  assert(
    !error && data?.length === 0,
    "Disabled viewer still read catalog rows",
  );
}

async function expectUploadUnavailable(admin) {
  // A minimal complete RIFF/WEBP container passes the function's structural
  // validation and reaches the R2 configuration check without storing bytes.
  const bytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 14, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x20, 1, 0, 0, 0, 0, 0,
  ]);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/webp" }), "smoke.webp");
  const { data: sessionData, error: sessionError } =
    await admin.auth.getSession();
  if (sessionError || !sessionData.session)
    throw sessionError || new Error("Admin session missing");
  const response = await fetch(
    `${url.replace(/\/$/, "")}/functions/v1/clinic-upload`,
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      body: form,
    },
  );
  const body = await response.json().catch(() => ({}));
  assert(
    response.status === 503 && body?.error?.code === "R2_NOT_CONFIGURED",
    "Expected clinic-upload to report R2_NOT_CONFIGURED",
  );
}

const admin = client();
const viewer = client();
const temporaryUsername = `clinic_smoke_${randomUUID().slice(0, 8)}`;
const temporaryPassword = `Smoke-${randomUUID()}!`;
let temporaryUserId;
let company;
let product;
let offer;
let viewerRecord;

try {
  await signIn(admin, adminUsername.toLowerCase(), adminPassword);
  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("id, username, active")
    .eq("username", adminUsername.toLowerCase())
    .single();
  if (profileError || !profile?.active)
    throw profileError || new Error("Admin profile lookup failed");
  const { data: membership, error: membershipError } = await admin
    .from("admin")
    .select("id")
    .eq("id", profile.id)
    .single();
  if (membershipError || !membership)
    throw membershipError || new Error("Admin membership lookup failed");

  company = await catalogInsert(admin, "companies", {
    id: randomUUID(),
    name: "Clinic smoke company",
    name_ar: "شركة اختبار كلينيك",
    name_en: "Clinic smoke company",
    phone: null,
    logo_url: null,
    revision: 1,
  });
  company = await catalogUpdate(admin, "companies", company, {
    name: "Clinic smoke company updated",
    name_en: "Clinic smoke company updated",
  });
  product = await catalogInsert(admin, "products", {
    id: randomUUID(),
    company_id: company.id,
    name: "Clinic smoke product",
    name_ar: "منتج اختبار كلينيك",
    name_en: "Clinic smoke product",
    qty: 1,
    size_value: 30,
    size_unit: "ml",
    img_url: null,
    discount: null,
    final_price: 10,
    product_url: "https://example.com/clinic-smoke-product",
    revision: 1,
  });
  offer = await catalogInsert(admin, "offers", {
    id: randomUUID(),
    company_id: company.id,
    name: "Clinic smoke offer",
    name_ar: "عرض اختبار كلينيك",
    name_en: "Clinic smoke offer",
    description_ar: "وصف اختبار كلينيك",
    description_en: "Clinic smoke offer description",
    img_link: null,
    revision: 1,
  });

  const created = await edge(admin, "clinic-admin-users", {
    action: "create",
    username: temporaryUsername,
    name: "Clinic smoke viewer",
    phone: "",
    password: temporaryPassword,
    active: true,
  });
  viewerRecord = created.user;
  temporaryUserId = viewerRecord?.id;
  assert(temporaryUserId, "Temporary viewer was not returned");
  await signIn(viewer, temporaryUsername, temporaryPassword);
  const { data: readable, error: readError } = await viewer
    .from("companies")
    .select("id")
    .eq("id", company.id)
    .single();
  if (readError || readable?.id !== company.id)
    throw readError || new Error("Active viewer could not read catalog");
  await expectViewerWriteDenied(viewer);

  const disabled = await edge(admin, "clinic-admin-users", {
    action: "set_active",
    userId: temporaryUserId,
    expectedRevision: viewerRecord.revision,
    active: false,
  });
  assert(disabled.user?.active === false, "Temporary viewer was not disabled");
  await expectViewerReadDenied(viewer);
  await expectUploadUnavailable(admin);
} finally {
  if (temporaryUserId) {
    // The edge contract intentionally has no delete action. Leave this UUID
    // in the final result so the operator can remove the Auth user and its
    // cascading profile after reviewing the smoke run.
    if (viewerRecord?.active !== false) {
      await edge(admin, "clinic-admin-users", {
        action: "set_active",
        userId: temporaryUserId,
        expectedRevision: viewerRecord.revision,
        active: false,
      }).catch(() => {});
    }
  }
  if (offer) await catalogDelete(admin, "offers", offer).catch(() => {});
  if (product) await catalogDelete(admin, "products", product).catch(() => {});
  if (company) await catalogDelete(admin, "companies", company).catch(() => {});
  await viewer.auth.signOut().catch(() => {});
  await admin.auth.signOut().catch(() => {});
}

console.log(JSON.stringify({ ok: true, temporaryUserId }));
