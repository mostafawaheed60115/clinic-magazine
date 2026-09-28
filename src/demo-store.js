import { seedData } from "./data.js";
import { DEFAULT_CONSULTATION_SETTINGS } from "./consultation.js";
import { reportTimeBounds } from "./reporting.js";

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
  const request = indexedDB.open("clinic-magazine", 5);
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
    const orders = request.result.objectStoreNames.contains("orders")
      ? request.transaction.objectStore("orders")
      : request.result.createObjectStore("orders", { keyPath: "id" });
    if (!orders.indexNames.contains("user_submission"))
      orders.createIndex("user_submission", ["user_id", "submission_id"], {
        unique: true,
      });
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

export async function readSettings() {
  await openStore();
  const tx = db.transaction("meta", "readonly");
  const saved = await result(tx.objectStore("meta").get("settings"));
  return { ...DEFAULT_CONSULTATION_SETTINGS, ...saved?.value };
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

export async function placeOrder(items, userId, user = {}, submissionId) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 100)
    throw new Error("invalid_order_items");
  const ids = new Set();
  for (const item of items) {
    if (
      !item ||
      typeof item.product_id !== "string" ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 9999 ||
      ids.has(item.product_id)
    )
      throw new Error("invalid_order_items");
    ids.add(item.product_id);
  }

  await openStore();
  const tx = db.transaction(["products", "companies", "orders"], "readwrite");
  const done = finished(tx);
  const ordersStore = tx.objectStore("orders");
  const existing = await result(
    ordersStore.index("user_submission").get([userId, submissionId]),
  );
  if (existing) {
    await done;
    return existing;
  }
  const [products, companies] = await Promise.all([
    result(tx.objectStore("products").getAll()),
    result(tx.objectStore("companies").getAll()),
  ]);
  const productsById = new Map(products.map((item) => [item.id, item]));
  const companiesById = new Map(companies.map((item) => [item.id, item]));
  const orderItems = items.map(({ product_id, quantity }) => {
    const product = productsById.get(product_id);
    const company = product && companiesById.get(product.company_id);
    if (!product || !company) return null;
    const unitPrice =
      Math.round((Number(product.final_price) || 0) * 100) / 100;
    return {
      product_id,
      company_id: company.id,
      product_name_ar: product.name_ar,
      product_name_en: product.name_en,
      company_name_ar: company.name_ar,
      company_name_en: company.name_en,
      image_url: product.img_url || null,
      unit_price: unitPrice,
      quantity,
      line_total: Math.round(unitPrice * quantity * 100) / 100,
    };
  });
  if (orderItems.some((item) => !item)) {
    tx.abort();
    await done.catch(() => {});
    throw new Error("product_unavailable");
  }

  const order = {
    id: crypto.randomUUID(),
    user_id: userId,
    submission_id: submissionId,
    customer_name: user.name || "Demo customer",
    customer_username: user.username || String(userId).replace(/^demo-/, ""),
    status: "placed",
    revision: 1,
    subtotal:
      Math.round(
        orderItems.reduce((sum, item) => sum + item.line_total, 0) * 100,
      ) / 100,
    created_at: new Date().toISOString(),
    items: orderItems,
  };
  ordersStore.put(order);
  await done;
  return order;
}

export async function readOrders(page = 1, pageSize = 25) {
  await openStore();
  const tx = db.transaction("orders", "readonly");
  const done = finished(tx);
  const items = await result(tx.objectStore("orders").getAll());
  await done;
  items.sort((first, second) =>
    second.created_at.localeCompare(first.created_at),
  );
  const requestedPage = Math.max(1, Math.floor(Number(page) || 1));
  const safePageSize = Math.max(1, Math.floor(Number(pageSize) || 25));
  const lastPage = Math.max(1, Math.ceil(items.length / safePageSize));
  const currentPage = Math.min(requestedPage, lastPage);
  const from = (currentPage - 1) * safePageSize;
  return {
    items: items.slice(from, from + safePageSize),
    total: items.length,
    page: currentPage,
    pageSize: safePageSize,
  };
}

export async function updateOrderStatus(orderId, status, expectedRevision) {
  await openStore();
  const tx = db.transaction("orders", "readwrite");
  const done = finished(tx);
  const store = tx.objectStore("orders");
  const current = await result(store.get(orderId));
  const allowed =
    (current?.status === "placed" &&
      ["confirmed", "cancelled"].includes(status)) ||
    (current?.status === "confirmed" &&
      ["fulfilled", "cancelled"].includes(status));
  if (!current || current.revision !== expectedRevision || !allowed) {
    tx.abort();
    await done.catch(() => {});
    const error = new Error(
      "Order changed or its status transition is invalid",
    );
    error.code = current ? "order_conflict" : "order_not_found";
    throw error;
  }
  const updated = {
    ...current,
    status,
    revision: current.revision + 1,
    updated_at: new Date().toISOString(),
  };
  store.put(updated);
  await done;
  return updated;
}

export async function readOrderReports(startDate, endDate) {
  await openStore();
  const tx = db.transaction(["orders", "products", "companies"], "readonly");
  const done = finished(tx);
  const [allOrders, catalogProducts, catalogCompanies] = await Promise.all([
    result(tx.objectStore("orders").getAll()),
    result(tx.objectStore("products").getAll()),
    result(tx.objectStore("companies").getAll()),
  ]);
  await done;
  const productsById = new Map(catalogProducts.map((item) => [item.id, item]));
  const companiesById = new Map(
    catalogCompanies.map((item) => [item.id, item]),
  );
  const { start: startsAt, end: endsAt } = reportTimeBounds(startDate, endDate);
  const orders = allOrders.filter((order) => {
    const createdAt = new Date(order.created_at).getTime();
    return (
      order.status === "fulfilled" &&
      createdAt >= startsAt &&
      createdAt < endsAt
    );
  });
  const items = orders.flatMap((order) =>
    order.items.map((item) => ({ ...item, order_id: order.id })),
  );
  const grouped = (key, makeRow) => {
    const groups = new Map();
    for (const row of items) {
      const identity = key(row);
      const group = groups.get(identity) || makeRow(row);
      group.quantity += row.quantity;
      group.orders.add(row.order_id);
      group.gross_item_subtotal += row.line_total;
      groups.set(identity, group);
    }
    return [...groups.values()]
      .map((group) => ({
        ...group,
        orders: group.orders.size,
        gross_item_subtotal: Math.round(group.gross_item_subtotal * 100) / 100,
      }))
      .sort(
        (a, b) =>
          b.quantity - a.quantity ||
          b.gross_item_subtotal - a.gross_item_subtotal,
      )
      .slice(0, 10);
  };
  const uniqueItems = grouped(
    (item) =>
      item.product_id ||
      `deleted:${JSON.stringify([
        item.product_name_ar,
        item.product_name_en,
        item.company_name_ar,
        item.company_name_en,
      ])}`,
    (item) => {
      const product = productsById.get(item.product_id);
      return {
        product_id: item.product_id,
        product_name_ar: product?.name_ar || item.product_name_ar,
        product_name_en: product?.name_en || item.product_name_en,
        image_url: product?.img_url || item.image_url,
        quantity: 0,
        orders: new Set(),
        gross_item_subtotal: 0,
      };
    },
  );
  const brands = grouped(
    (item) =>
      item.company_id ||
      `deleted:${JSON.stringify([item.company_name_ar, item.company_name_en])}`,
    (item) => {
      const company = companiesById.get(item.company_id);
      return {
        company_id: item.company_id,
        company_name_ar: company?.name_ar || item.company_name_ar,
        company_name_en: company?.name_en || item.company_name_en,
        quantity: 0,
        orders: new Set(),
        gross_item_subtotal: 0,
      };
    },
  );
  const clients = new Map();
  for (const order of orders) {
    const client = clients.get(order.user_id) || {
      user_id: order.user_id,
      customer_name: order.customer_name,
      customer_username: order.customer_username,
      fulfilled_orders: 0,
      gross_item_subtotal: 0,
    };
    client.fulfilled_orders += 1;
    client.gross_item_subtotal += order.subtotal;
    clients.set(order.user_id, client);
  }
  const highestClients = [...clients.values()]
    .map((client) => ({
      ...client,
      gross_item_subtotal: Math.round(client.gross_item_subtotal * 100) / 100,
    }))
    .sort(
      (a, b) =>
        b.gross_item_subtotal - a.gross_item_subtotal ||
        b.fulfilled_orders - a.fulfilled_orders,
    )
    .slice(0, 10);
  const gross = orders.reduce((sum, order) => sum + order.subtotal, 0);
  return {
    start_date: startDate,
    end_date: endDate,
    financial: {
      currency: "EGP",
      fulfilled_orders: orders.length,
      gross_item_subtotal: Math.round(gross * 100) / 100,
      average_order_subtotal:
        orders.length > 0 ? Math.round((gross / orders.length) * 100) / 100 : 0,
    },
    top_selling_items: uniqueItems,
    most_ordered_brands: brands,
    highest_purchase_clients: highestClients,
  };
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
      "orders",
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
  tx.objectStore("orders").clear();
  tx.objectStore("meta").put({
    id: "settings",
    value: { ...DEFAULT_CONSULTATION_SETTINGS, revision: Date.now() },
  });
  await done;
  channel?.postMessage("updated");
}
