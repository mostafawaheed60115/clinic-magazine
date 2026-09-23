import { seedData } from "./data.js";
import { DEFAULT_CONSULTATION_SETTINGS } from "./consultation.js";

export const collections = ["companies", "products", "offers"];
export const channel =
  typeof BroadcastChannel === "function"
    ? new BroadcastChannel("clinic-updates")
    : null;

let db;

const result = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const finished = (transaction) =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error("aborted"));
  });

export async function openStore() {
  if (db) return db;
  const request = indexedDB.open("clinic-magazine", 1);
  request.onupgradeneeded = () => {
    for (const collection of collections)
      request.result.createObjectStore(collection, { keyPath: "id" });
    request.result.createObjectStore("meta", { keyPath: "id" });
  };
  db = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("blocked"));
  });
  db.onversionchange = () => {
    db.close();
    db = null;
  };
  // Initialization uses one read/write transaction, avoiding duplicate seeding across tabs.
  const tx = db.transaction([...collections, "meta"], "readwrite");
  const done = finished(tx);
  const exists = await result(tx.objectStore("meta").get("seeded"));
  if (!exists) {
    const seed = seedData();
    for (const collection of collections)
      for (const item of seed[collection]) tx.objectStore(collection).put(item);
    tx.objectStore("meta").put({ id: "seeded", value: true });
  }
  await done;
  return db;
}

export async function readAll() {
  await openStore();
  const tx = db.transaction([...collections, "meta"], "readonly");
  const settingsRead = result(tx.objectStore("meta").get("settings"));
  const values = await Promise.all(
    collections.map((collection) =>
      result(tx.objectStore(collection).getAll()),
    ),
  );
  const settings = await settingsRead;
  return {
    ...Object.fromEntries(
      collections.map((collection, i) => [collection, values[i]]),
    ),
    settings: settings?.value || DEFAULT_CONSULTATION_SETTINGS,
  };
}

export async function saveConsultationSettings(phone, expectedRevision) {
  await openStore();
  const tx = db.transaction("meta", "readwrite");
  const done = finished(tx);
  const store = tx.objectStore("meta");
  const current =
    (await result(store.get("settings")))?.value ||
    DEFAULT_CONSULTATION_SETTINGS;
  if (current.revision !== expectedRevision) {
    tx.abort();
    await done.catch(() => {});
    const error = new Error("Settings changed in another window");
    error.code = "conflict";
    throw error;
  }
  const settings = {
    ...current,
    whatsapp_phone: phone,
    revision: expectedRevision + 1,
  };
  store.put({ id: "settings", value: settings });
  await done;
  channel?.postMessage("updated");
  return settings;
}

export async function saveItem(collection, item, expectedRevision) {
  await openStore();
  const tx = db.transaction(collections, "readwrite");
  const done = finished(tx);
  let issue;
  const store = tx.objectStore(collection);
  const current = await result(store.get(item.id));
  if ((current?.revision ?? 0) !== expectedRevision) issue = "conflict";
  if (
    collection !== "companies" &&
    !(await result(tx.objectStore("companies").get(item.company_id)))
  )
    issue = "conflict";
  if (issue) {
    tx.abort();
    await done.catch(() => {});
    throw new Error(issue);
  }
  store.put({ ...item, revision: expectedRevision + 1 });
  await done;
  channel?.postMessage("updated");
}

export async function deleteItem(collection, id, revision) {
  await openStore();
  const tx = db.transaction(collections, "readwrite");
  const done = finished(tx);
  const current = await result(tx.objectStore(collection).get(id));
  let issue;
  if (current?.revision !== revision) issue = "conflict";
  if (collection === "companies") {
    const [products, offers] = await Promise.all(
      ["products", "offers"].map((name) =>
        result(tx.objectStore(name).getAll()),
      ),
    );
    if ([...products, ...offers].some((item) => item.company_id === id))
      issue = "inUse";
  }
  if (issue) {
    tx.abort();
    await done.catch(() => {});
    throw new Error(issue);
  }
  tx.objectStore(collection).delete(id);
  await done;
  channel?.postMessage("updated");
}

export async function resetStore() {
  await openStore();
  const tx = db.transaction([...collections, "meta"], "readwrite");
  const done = finished(tx);
  const seed = seedData();
  for (const collection of collections) {
    tx.objectStore(collection).clear();
    // A reset invalidates every open editor, even when a seed id is reused.
    for (const item of seed[collection])
      tx.objectStore(collection).put({ ...item, revision: Date.now() });
  }
  tx.objectStore("meta").put({
    id: "settings",
    value: { ...DEFAULT_CONSULTATION_SETTINGS, revision: Date.now() },
  });
  await done;
  channel?.postMessage("updated");
}
