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
    "is_exclusive",
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
    "is_exclusive",
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

/**
 * Return a storage key only for files owned by this project's image bucket.
 * External URLs and malformed values are intentionally ignored so cleanup can
 * never remove a shared or user supplied image.
 */
export function managedImageKey(value) {
  if (!value || !supabaseUrl) return null;
  try {
    const url = new URL(value);
    const projectOrigin = new URL(supabaseUrl).origin;
    const prefix = `/storage/v1/object/public/${IMAGE_BUCKET}/`;
    if (url.origin !== projectOrigin || !url.pathname.startsWith(prefix))
      return null;
    const key = decodeURIComponent(url.pathname.slice(prefix.length));
    if (!key.startsWith("clinic/") || key.includes("..")) return null;
    return key;
  } catch {
    return null;
  }
}

/**
 * Clean an object that has just been uploaded and has never been part of a
 * catalog write. Callers use this only for abandoned uploads, so committed
 * replacement/deletion GC stays server-side and race-free.
 */
export async function cleanupFreshManagedImage(value, client = supabase) {
  const key = managedImageKey(value);
  if (!key || !client) return false;
  try {
    const { error } = await client.storage.from(IMAGE_BUCKET).remove([key]);
    return !error;
  } catch {
    return false;
  }
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
  if (collection === "products" && record.product_url === "")
    record.product_url = null;
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
      .select(columns[collection].join(", "))
      .order("name_en", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []).map((item) => fromDatabase(collection, item)));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

// Page through event data so the admin request list does not stop at the
// Data API's per-request row cap.
async function readEventRows(table, fields, sortColumn) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    if (offset >= MAX_ROWS)
      throw errorWithCode(
        `${table} exceeds the configured bound`,
        "too_many_rows",
      );
    let query = requireClient()
      .from(table)
      .select(fields)
      .order(sortColumn, { ascending: false });
    query = query.order("id", { ascending: true });
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

export async function readSettings() {
  const { data, error } = await requireClient()
    .from("app_settings")
    .select(
      "id, whatsapp_phone, telesales_whatsapp_phone, complaints_phone, customer_service_phone, contact_phone, revision",
    )
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data;
}

export async function readCatalog({
  includeEvents = false,
  includeEventRequests = false,
} = {}) {
  const [values, settingsResult, surveys, requests] = await Promise.all([
    Promise.all(COLLECTIONS.map(readCollection)),
    requireClient()
      .from("app_settings")
      .select(
        "id, whatsapp_phone, telesales_whatsapp_phone, complaints_phone, customer_service_phone, contact_phone, revision",
      )
      .eq("id", 1)
      .single(),
    includeEvents
      ? readEventRows(
          "event_surveys",
          "id, is_open, started_at, ended_at, revision",
          "started_at",
        )
      : Promise.resolve([]),
    includeEventRequests
      ? readEventRows(
          "event_requests",
          "id, survey_id, user_id, pharmacy_name, pharmacy_code, pharmacy_address, doctor_name, phone, preferred_date, starts_at, ends_at, company_ids, company_names, activities, submitted_at",
          "submitted_at",
        )
      : Promise.resolve([]),
  ]);
  if (settingsResult.error) throw settingsResult.error;
  return {
    ...Object.fromEntries(
      COLLECTIONS.map((collection, index) => [collection, values[index]]),
    ),
    settings: settingsResult.data,
    event_surveys: surveys,
    event_requests: requests,
  };
}

export async function saveConsultationSettings(settings, expectedRevision) {
  const { data, error } = await requireClient()
    .from("app_settings")
    .update({ ...settings, revision: expectedRevision + 1 })
    .eq("id", 1)
    .eq("revision", expectedRevision)
    .select(
      "id, whatsapp_phone, telesales_whatsapp_phone, complaints_phone, customer_service_phone, contact_phone, revision",
    )
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw errorWithCode("Settings changed in another session", "conflict");
  return data;
}

export async function saveEventSurvey(survey, expectedRevision = 0) {
  const client = requireClient();
  const query = survey.id
    ? client
        .from("event_surveys")
        .update({
          is_open: false,
          ended_at: new Date().toISOString(),
          revision: expectedRevision + 1,
        })
        .eq("id", survey.id)
        .eq("revision", expectedRevision)
    : client.from("event_surveys").insert({ is_open: true, revision: 1 });
  const { data, error } = await query.select().maybeSingle();
  if (error) throw error;
  if (!data)
    throw errorWithCode("Event changed in another session", "conflict");
  return data;
}

export async function submitEventRequest(request, userId) {
  const { data, error } = await requireClient()
    .from("event_requests")
    .insert({
      survey_id: request.survey_id,
      user_id: userId,
      pharmacy_name: request.pharmacy_name,
      pharmacy_code: request.pharmacy_code,
      pharmacy_address: request.pharmacy_address,
      doctor_name: request.doctor_name,
      phone: request.phone,
      preferred_date: request.preferred_date,
      starts_at: request.starts_at,
      ends_at: request.ends_at,
      company_ids: request.company_ids,
      activities: request.activities,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data;
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

export async function importBrandProducts(companyId, rows, dryRun = true) {
  const client = requireClient();
  const { data, error } = await client.rpc("import_brand_products", {
    p_company_id: companyId,
    p_rows: rows,
    p_dry_run: dryRun,
  });
  if (error) throw error;
  return data;
}

export async function placeOrder(items, submissionId) {
  const { data, error } = await requireClient().rpc("place_order", {
    p_items: items.map(({ product_id, quantity }) => ({
      product_id,
      quantity,
    })),
    p_submission_id: submissionId,
  });
  if (error) throw error;
  return data;
}

export async function readAdminOrders(page = 1, pageSize = 25) {
  const requestedPage = Math.max(1, Math.floor(Number(page) || 1));
  const safePageSize = Math.max(1, Math.floor(Number(pageSize) || 25));
  const fetchPage = (currentPage) => {
    const from = (currentPage - 1) * safePageSize;
    return requireClient()
      .from("orders")
      .select(
        "id, user_id, customer_name, customer_username, status, subtotal, revision, created_at, order_items(id, product_id, company_id, product_name_ar, product_name_en, company_name_ar, company_name_en, image_url, unit_price, quantity, line_total)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + safePageSize - 1);
  };
  let result = await fetchPage(requestedPage);
  if (result.error) throw result.error;
  const total = result.count || 0;
  const lastPage = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.min(requestedPage, lastPage);
  if (currentPage !== requestedPage) {
    result = await fetchPage(currentPage);
    if (result.error) throw result.error;
  }
  return {
    items: result.data || [],
    total,
    page: currentPage,
    pageSize: safePageSize,
  };
}

export async function readAdminOrderReports(startDate, endDate) {
  const { data, error } = await requireClient().rpc("get_admin_order_reports", {
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw error;
  return data;
}

export async function updateOrderStatus(orderId, status, expectedRevision) {
  const { data, error } = await requireClient().rpc("update_order_status", {
    p_order_id: orderId,
    p_status: status,
    p_expected_revision: expectedRevision,
  });
  if (error) throw error;
  return data;
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
