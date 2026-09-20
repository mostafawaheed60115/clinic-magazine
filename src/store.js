import { isDemoMode } from "./auth.js";
import * as demoStore from "./demo-store.js";
import {
  cloudConfigured,
  readCatalog,
  saveCatalogItem,
  deleteCatalogItem,
} from "./cloud.js";

export const collections = demoStore.collections;
export const channel = demoStore.channel;
export { isDemoMode };
export const openStore = demoStore.openStore;

const hasCloudConfig = () => cloudConfigured;
const unconfigured = () => {
  const error = new Error("Catalog storage is not configured");
  error.code = "unconfigured";
  return error;
};

export async function readAll() {
  if (isDemoMode()) return demoStore.readAll();
  if (!hasCloudConfig()) throw unconfigured();
  return readCatalog();
}

export async function saveItem(collection, item, expectedRevision) {
  if (isDemoMode())
    return demoStore.saveItem(collection, item, expectedRevision);
  if (!hasCloudConfig()) throw unconfigured();
  const saved = await saveCatalogItem(collection, item, expectedRevision);
  channel?.postMessage("updated");
  return saved;
}

export async function deleteItem(collection, id, revision) {
  if (isDemoMode()) return demoStore.deleteItem(collection, id, revision);
  if (!hasCloudConfig()) throw unconfigured();
  await deleteCatalogItem(collection, id, revision);
  channel?.postMessage("updated");
}

export async function resetStore() {
  if (isDemoMode()) return demoStore.resetStore();
  throw new Error("Reset is available only in demo mode");
}
