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
  const request = indexedDB.open("clinic-magazine", 3);
  request.onupgradeneeded = () => {
    for (const collection of collections)
      if (!request.result.objectStoreNames.contains(collection))
        request.result.createObjectStore(collection, { keyPath: "id" });
    if (!request.result.objectStoreNames.contains("meta"))
      request.result.createObjectStore("meta", { keyPath: "id" });
    if (!request.result.objectStoreNames.contains("events"))
      request.result.createObjectStore("events", { keyPath: "id" });
    if (!request.result.objectStoreNames.contains("event_participants"))
      request.result.createObjectStore("event_participants", {
        keyPath: ["event_id", "user_id"],
      });
    if (!request.result.objectStoreNames.contains("event_surveys"))
      request.result.createObjectStore("event_surveys", { keyPath: "id" });
    if (!request.result.objectStoreNames.contains("event_requests"))
      request.result.createObjectStore("event_requests", { keyPath: "id" });
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

export async function readAll({
  includeEvents = false,
  includeEventRequests = false,
} = {}) {
  await openStore();
  const stores = [...collections, "meta"];
  if (includeEvents) stores.push("event_surveys");
  if (includeEventRequests) stores.push("event_requests");
  const tx = db.transaction(stores, "readonly");
  const settingsRead = result(tx.objectStore("meta").get("settings"));
  const surveysRead = includeEvents
    ? result(tx.objectStore("event_surveys").getAll())
    : Promise.resolve([]);
  const requestsRead = includeEventRequests
    ? result(tx.objectStore("event_requests").getAll())
    : Promise.resolve([]);
  const values = await Promise.all(
    collections.map((collection) =>
      result(tx.objectStore(collection).getAll()),
    ),
  );
  const settings = await settingsRead;
  const eventSurveys = await surveysRead;
  const eventRequests = await requestsRead;
  return {
    ...Object.fromEntries(
      collections.map((collection, i) => [collection, values[i]]),
    ),
    settings: { ...DEFAULT_CONSULTATION_SETTINGS, ...settings?.value },
    event_surveys: eventSurveys,
    event_requests: eventRequests,
  };
}

export async function saveConsultationSettings(values, expectedRevision) {
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
    ...values,
    revision: expectedRevision + 1,
  };
  store.put({ id: "settings", value: settings });
  await done;
  channel?.postMessage("updated");
  return settings;
}

export async function saveEventSurvey(survey, expectedRevision = 0) {
  await openStore();
  const tx = db.transaction("event_surveys", "readwrite");
  const done = finished(tx);
  const store = tx.objectStore("event_surveys");
  const current = survey.id ? await result(store.get(survey.id)) : null;
  if ((current?.revision || 0) !== expectedRevision) {
    tx.abort();
    await done.catch(() => {});
    const error = new Error("conflict");
    error.code = "conflict";
    throw error;
  }
  if (!survey.id) {
    const active = (await result(store.getAll())).some((item) => item.is_open);
    if (active) {
      tx.abort();
      await done.catch(() => {});
      throw new Error("survey_already_open");
    }
  }
  const saved = {
    id: survey.id || crypto.randomUUID(),
    is_open: Boolean(survey.is_open),
    started_at: current?.started_at || new Date().toISOString(),
    ended_at: survey.is_open ? null : new Date().toISOString(),
    revision: expectedRevision + 1,
  };
  store.put(saved);
  await done;
  return saved;
}

export async function submitEventRequest(request, userId) {
  await openStore();
  const tx = db.transaction(
    ["event_surveys", "event_requests", "companies"],
    "readwrite",
  );
  const done = finished(tx);
  const survey = await result(
    tx.objectStore("event_surveys").get(request.survey_id),
  );
  if (!survey?.is_open) {
    tx.abort();
    await done.catch(() => {});
    throw new Error("event_closed");
  }
  const brands = await result(tx.objectStore("companies").getAll());
  const selected = new Set(request.company_ids);
  const chosenBrands = brands.filter((brand) => selected.has(brand.id));
  if (chosenBrands.length !== selected.size) {
    tx.abort();
    await done.catch(() => {});
    throw new Error("invalid_company");
  }
  tx.objectStore("event_requests").put({
    ...request,
    id: crypto.randomUUID(),
    user_id: userId,
    company_names: chosenBrands.map((brand) => ({
      id: brand.id,
      name_ar: brand.name_ar,
      name_en: brand.name_en,
    })),
    submitted_at: new Date().toISOString(),
  });
  await done;
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
  const tx = db.transaction(
    [
      ...collections,
      "meta",
      "events",
      "event_participants",
      "event_surveys",
      "event_requests",
    ],
    "readwrite",
  );
  const done = finished(tx);
  const seed = seedData();
  for (const collection of collections) {
    tx.objectStore(collection).clear();
    // A reset invalidates every open editor, even when a seed id is reused.
    for (const item of seed[collection])
      tx.objectStore(collection).put({ ...item, revision: Date.now() });
  }
  tx.objectStore("events").clear();
  tx.objectStore("event_participants").clear();
  tx.objectStore("event_surveys").clear();
  tx.objectStore("event_requests").clear();
  tx.objectStore("meta").put({
    id: "settings",
    value: { ...DEFAULT_CONSULTATION_SETTINGS, revision: Date.now() },
  });
  await done;
  channel?.postMessage("updated");
}
