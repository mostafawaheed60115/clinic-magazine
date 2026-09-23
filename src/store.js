import { ensureSessionValid, getAuthState, isDemoMode } from "./auth.js";
import * as demoStore from "./demo-store.js";
import {
  cloudConfigured,
  readCatalog,
  saveCatalogItem,
  deleteCatalogItem,
  importBrandProducts as importBrandProductsRemote,
  saveConsultationSettings as saveConsultationSettingsRemote,
} from "./cloud.js";
import { normalizeWhatsappPhone } from "./consultation.js";

export const collections = demoStore.collections;
export const channel = demoStore.channel;
export { isDemoMode };
export const openStore = demoStore.openStore;

const hasCloudConfig = () => cloudConfigured;
const CACHE_TTL_MS = 30_000;
let catalogCache = null;
let catalogRead = null;
let cacheGeneration = 0;

function catalogIdentity() {
  const state = getAuthState();
  return `${state.mode}:${state.session?.user?.id || state.user?.id || ""}`;
}

export function invalidateCatalogCache() {
  cacheGeneration += 1;
  catalogCache = null;
  // An old request may still complete. Its generation check prevents it from
  // repopulating the cache after a write or auth transition.
  catalogRead = null;
}

const unconfigured = () => {
  const error = new Error("Catalog storage is not configured");
  error.code = "unconfigured";
  return error;
};

async function requireSession() {
  if (await ensureSessionValid()) return;
  const error = new Error("Your session has expired");
  error.code = "session_expired";
  throw error;
}

export async function readAll({ force = false } = {}) {
  await requireSession();
  const identity = catalogIdentity();
  const now = Date.now();
  if (
    !force &&
    catalogCache?.identity === identity &&
    catalogCache.expiresAt > now
  )
    return catalogCache.data;
  const generation = cacheGeneration;
  if (!force && catalogRead?.identity === identity) return catalogRead.promise;
  const promise = (
    isDemoMode()
      ? demoStore.readAll()
      : hasCloudConfig()
        ? readCatalog()
        : Promise.reject(unconfigured())
  ).then((data) => {
    if (generation === cacheGeneration && identity === catalogIdentity()) {
      catalogCache = { data, identity, expiresAt: Date.now() + CACHE_TTL_MS };
    }
    return data;
  });
  catalogRead = { identity, generation, promise };
  promise
    .then(undefined, () => {})
    .then(() => {
      if (catalogRead?.promise === promise) catalogRead = null;
    });
  return promise;
}

export async function saveItem(collection, item, expectedRevision) {
  await requireSession();
  if (isDemoMode()) {
    const saved = await demoStore.saveItem(collection, item, expectedRevision);
    invalidateCatalogCache();
    return saved;
  }
  if (!hasCloudConfig()) throw unconfigured();
  const saved = await saveCatalogItem(collection, item, expectedRevision);
  invalidateCatalogCache();
  channel?.postMessage("updated");
  return saved;
}

export async function saveConsultationSettings(phone, expectedRevision) {
  await requireSession();
  const normalized = normalizeWhatsappPhone(phone);
  if (!normalized) {
    const error = new Error("Invalid WhatsApp phone number");
    error.code = "invalid_phone";
    throw error;
  }
  if (!isDemoMode() && !hasCloudConfig()) throw unconfigured();
  const saved = isDemoMode()
    ? await demoStore.saveConsultationSettings(normalized, expectedRevision)
    : await saveConsultationSettingsRemote(normalized, expectedRevision);
  invalidateCatalogCache();
  if (!isDemoMode()) channel?.postMessage("updated");
  return saved;
}

export async function deleteItem(collection, id, revision) {
  await requireSession();
  if (isDemoMode()) {
    await demoStore.deleteItem(collection, id, revision);
    invalidateCatalogCache();
    return;
  }
  if (!hasCloudConfig()) throw unconfigured();
  await deleteCatalogItem(collection, id, revision);
  invalidateCatalogCache();
  channel?.postMessage("updated");
}

export async function importBrandProducts(companyId, rows, dryRun = true) {
  await requireSession();
  if (isDemoMode()) {
    const error = new Error("CSV imports require the connected Clinic account");
    error.code = "demo_import_unavailable";
    throw error;
  }
  if (!hasCloudConfig()) throw unconfigured();
  const result = await importBrandProductsRemote(companyId, rows, dryRun);
  if (!dryRun && result?.ok !== false) {
    invalidateCatalogCache();
    channel?.postMessage("updated");
  }
  return result;
}

export async function resetStore() {
  await requireSession();
  if (isDemoMode()) {
    await demoStore.resetStore();
    invalidateCatalogCache();
    return;
  }
  throw new Error("Reset is available only in demo mode");
}
