import { createClient } from "@supabase/supabase-js";

// These are browser-safe project settings. Environment variables still win so
// another deployment can point the magazine at a different Supabase project.
// Never add a service-role key here: only the publishable key belongs in the
// client bundle.
const DEFAULT_SUPABASE_URL = "https://twllyczdtmitsupfvjgx.supabase.co";
const DEFAULT_PUBLISHABLE_KEY =
  "sb_publishable_z4d37t9sfGZyrXRquZCXDA_5UfPVqZ5";
const supabaseUrl = String(
  import.meta.env?.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
).trim();
const publishableKey = String(
  import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_PUBLISHABLE_KEY,
).trim();

export const cloudConfigured = Boolean(supabaseUrl && publishableKey);
export const supabase = cloudConfigured
  ? createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export const getSupabase = () => supabase;
export const IMAGE_BUCKET = "clinic-images";

const COLLECTIONS = ["companies", "products", "offers"];
const PAGE_SIZE = 500;
const MAX_ROWS = 100_000;

const columns = {
  companies: [
    "id",
    "name",
    "name_ar",
    "name_en",
    "phone",
    "parent",
    "parent_id",
    "logo_url",
    "revision",
    "create_date",
  ],
  products: [
    "id",
    "company_id",
    "name",
    "name_ar",
    "name_en",
    "qty",
    "size_value",
    "size_unit",
    "img_url",
    "discount",
    "final_price",
    "product_url",
    "revision",
    "create_date",
  ],
  offers: [
    "id",
    "company_id",
    "name",
    "name_ar",
    "name_en",
    "description_ar",
    "description_en",
    "img_link",
    "revision",
    "create_date",
  ],
};

const localFields = {
  companies: [
    "id",
    "name_ar",
    "name_en",
    "phone",
    "parent",
    "parent_id",
    "logo_url",
    "revision",
  ],
  products: [
    "id",
    "company_id",
    "name_ar",
    "name_en",
    "qty",
    "size_value",
    "size_unit",
    "img_url",
    "discount",
    "final_price",
    "product_url",
    "revision",
  ],
  offers: [
    "id",
    "company_id",
    "name_ar",
    "name_en",
    "description_ar",
    "description_en",
    "img_link",
    "revision",
  ],
};

const errorWithCode = (message, code) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

function requireClient() {
  if (!supabase)
    throw errorWithCode("Supabase is not configured", "unconfigured");
  return supabase;
}

function toDatabase(collection, item) {
  if (!columns[collection])
    throw new Error(`Unknown collection: ${collection}`);
  const record = {};
  for (const key of columns[collection]) {
    if (item[key] !== undefined) record[key] = item[key];
  }
  // The schema's canonical name is the English display name. Keep both
  // localized fields for the magazine UI and future translations.
  if (record.name === undefined)
    record.name = record.name_en || record.name_ar || "";
  return record;
}

function fromDatabase(collection, item) {
  const record = {};
  for (const key of localFields[collection]) {
    if (item[key] !== undefined) record[key] = item[key];
  }
  record.name_ar ??= item.name_ar || item.name || "";
  record.name_en ??= item.name_en || item.name || "";
  return record;
}

async function readCollection(collection) {
  const client = requireClient();
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    if (offset >= MAX_ROWS)
      throw errorWithCode(
        `${collection} exceeds the configured catalog bound`,
        "too_many_rows",
      );
    const { data, error } = await client
      .from(collection)
      .select("*")
      .order("name_en", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []).map((item) => fromDatabase(collection, item)));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

export async function readCatalog() {
  const values = await Promise.all(COLLECTIONS.map(readCollection));
  return Object.fromEntries(
    COLLECTIONS.map((collection, index) => [collection, values[index]]),
  );
}

export async function saveCatalogItem(collection, item, expectedRevision) {
  const client = requireClient();
  const record = toDatabase(collection, item);
  const revision = Number(expectedRevision) || 0;
  if (revision === 0) {
    record.revision = 1;
    const { data, error } = await client
      .from(collection)
      .insert(record)
      .select()
      .maybeSingle();
    if (error) throw error;
    return fromDatabase(collection, data || record);
  }
  const { data, error } = await client
    .from(collection)
    .update({ ...record, revision: revision + 1 })
    .eq("id", item.id)
    .eq("revision", revision)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw errorWithCode("This record changed in another session", "conflict");
  return fromDatabase(collection, data);
}

export async function deleteCatalogItem(collection, id, revision) {
  const client = requireClient();
  const { data, error } = await client
    .from(collection)
    .delete()
    .eq("id", id)
    .eq("revision", revision)
    .select("id");
  if (error) {
    if (error.code === "23503") throw errorWithCode("inUse", "inUse");
    throw error;
  }
  if (!data?.length)
    throw errorWithCode("This record changed in another session", "conflict");
}

export async function invokeAdmin(action, payload = {}) {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("clinic-admin-users", {
    body: { action, ...payload },
  });
  if (error) throw error;
  return data;
}

export async function getCurrentSession() {
  const client = requireClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export { fromDatabase, toDatabase };
