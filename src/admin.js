import { t, locale, nameOf, number, money } from "./i18n.js";
import {
  esc,
  icon,
  arrow,
  button,
  image,
  empty,
  searchBox,
  paginate,
  pagination,
  matches,
  notify,
  ask,
  s,
  safeExternalUrl,
} from "./ui.js";
import {
  collections,
  saveItem,
  deleteItem,
  resetStore,
  importBrandProducts,
} from "./store.js";
import { loadUsers, createUser, updateUser, signOut } from "./auth.js";
import {
  prepareImage,
  uploadImage,
  releaseImage,
  scheduleManagedImageCleanup,
} from "./upload.js";
import { notFound } from "./pages.js";
import {
  downloadCsv,
  parseCsv,
  readCsvFile,
  productExportRows,
  productTemplateRows,
  importRows,
  serializeCsv,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  MAX_IMPORT_PAYLOAD_BYTES,
} from "./csv.js";
import a from "./styles/admin.module.css";

let dirty = false;
export const isDirty = () => dirty;
export const markClean = () => {
  dirty = false;
};
export async function mayLeave() {
  if (!dirty) return true;
  const leave = await ask(t("discardQuestion"), t("discardText"), t("discard"));
  if (leave) dirty = false;
  return leave;
}
const labelFor = (collection) =>
  collection === "companies" ? "brands" : collection;
const fileName = (value) =>
  String(value || "clinic")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "clinic";
const field = (key, label, value = "", options = {}) => {
  const id = `field-${key}`;
  return `<div class="${a.field} ${options.full ? a.full : ""}"><label for="${id}">${t(label)}</label><input id="${id}" name="${key}" value="${esc(value)}" type="${options.type || "text"}" ${options.required ? "required" : ""} ${options.dir ? `dir="${options.dir}"` : ""} ${options.extra || ""} aria-describedby="${id}-error" /><span class="${s.error}" id="${id}-error"></span></div>`;
};
const selectField = (key, label, options, value = "", required = true) =>
  `<div class="${a.field}"><label for="field-${key}">${t(label)}</label><select id="field-${key}" name="${key}" ${required ? "required" : ""} aria-describedby="field-${key}-error">${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`).join("")}</select><span id="field-${key}-error" class="${s.error}"></span></div>`;

function sidebar(route, authState) {
  const nav = [
    ...collections,
    ...(authState.isAdmin ? ["images", "users"] : []),
  ];
  const navigation = (className) =>
    `<nav class="${className}" aria-label="${t("admin")}"><a href="#/admin" ${!route.parts[1] ? 'aria-current="page"' : ""}>${icon("grid")}${t("overview")}</a>${nav.map((c) => `<a href="#/admin/${c}" ${route.parts[1] === c ? 'aria-current="page"' : ""}>${icon(c === "products" ? "bag" : c === "users" ? "user" : c === "images" ? "image" : "grid")}${esc(c === "images" ? t("imageLibrary") : t(labelFor(c)))}</a>`).join("")}</nav>`;
  return `<aside class="${a.sidebar}"><div class="${a.sidebarBrand}"><span class="${a.sidebarMark}"><img src="/assets/clinic-logo-transparent.png" alt="" width="64" height="64" /></span><div><strong>Clinic</strong><small>${t("admin")}</small></div><details class="${a.mobileNav}"><summary aria-label="${t("adminMenu")}">${icon("grid")}<span>${t("adminMenu")}</span></summary>${navigation(a.mobileNavMenu)}</details></div>${navigation(a.desktopNav)}<div class="${a.sidebarFoot}"><small>${authState.mode === "demo" ? t("localOnly") : t("cloudManaged")}</small>${button(t("signOut"), 'id="app-sign-out"', "ghost")}</div></aside>`;
}
function overview(data, authState) {
  const reset =
    authState.mode === "demo" ? button(t("reset"), 'id="reset-demo"') : "";
  const brandRows = data.companies
    .slice(0, 4)
    .map((brand) => {
      const productCount = data.products.filter(
        (product) => product.company_id === brand.id,
      ).length;
      return `<li><span class="${a.brandDot}" aria-hidden="true">${esc((nameOf(brand) || "?").slice(0, 1))}</span><span class="${a.overviewBrandName}"><bdi>${esc(nameOf(brand))}</bdi><small dir="ltr">${esc(brand.name_en || "")}</small></span><span class="${a.overviewBrandCount}">${number(productCount)} ${t("products")}</span><a class="${s.compactButton}" href="#/admin/companies/edit/${encodeURIComponent(brand.id)}">${t("manage")}${arrow()}</a></li>`;
    })
    .join("");
  const brandSection = data.companies.length
    ? `<section class="${a.overviewBrands}" aria-label="${t("brands")}"><div class="${a.overviewBrandsHead}"><h2>${t("brands")}</h2><a class="${s.compactButton}" href="#/admin/companies">${t("allBrands")}${arrow()}</a></div><ul>${brandRows}</ul></section>`
    : "";
  return `<div class="${a.head}"><div><h1 tabindex="-1">${t("overview")}</h1><p>${t("manageText")}</p></div></div>${authState.mode === "demo" ? `<p class="${s.banner}">${t("demoWarning")}</p>` : ""}<div class="${a.metrics}">${collections.map((c) => `<section class="${a.metric}"><strong>${number(data[c].length)}</strong><span>${t(labelFor(c))}</span><a href="#/admin/${c}">${t("manage")}${arrow()}</a></section>`).join("")}</div>${brandSection}${reset}<p id="admin-error" role="alert" class="${s.error}"></p>`;
}
function brandCsvActions(brand) {
  return `<div class="${a.rowTools}"><button type="button" class="${s.compactButton}" data-export-brand="${esc(brand.id)}">${t("exportProducts")}</button><button type="button" class="${s.compactButton}" data-template-brand="${esc(brand.id)}">${t("downloadTemplate")}</button><button type="button" class="${s.compactButton} ${s.primary}" data-import-brand="${esc(brand.id)}">${t("importProducts")}</button></div>`;
}
function list(data, route, c, users = []) {
  const q = route.params.get("q") || "";
  if (c === "users") return userList(users, q);
  const page = paginate(
    data[c].filter((item) => matches(item, q)),
    route,
    8,
  );
  const isBrands = c === "companies";
  return `<div class="${a.head}"><div><span class="${a.eyebrow}">${t("admin")}</span><h1 tabindex="-1">${t(labelFor(c))}</h1><p>${number(page.total)} ${t("results")}</p></div><a class="${s.button} ${s.primary}" href="#/admin/${c}/new">${icon("plus")}${t("add")}</a></div><div class="${a.listToolbar}">${searchBox(q, c === "products" ? "searchProducts" : "searchBrands")}<span class="${a.listHint}">${isBrands ? t("brandToolsHint") : t("manageText")}</span></div><p id="admin-error" class="${s.error}" role="alert"></p>${page.total ? `<div class="${a.tableWrap}" tabindex="0" role="region" aria-label="${t(labelFor(c))}"><table class="${a.table}"><thead><tr><th scope="col">${t(locale === "ar" ? "nameAr" : "nameEn")}</th><th scope="col">${t(c === "products" ? "finalPrice" : c === "companies" ? "products" : "brand")}</th><th scope="col">${t("actions")}</th></tr></thead><tbody>${page.items.map((item) => `<tr><td><div class="${a.imageCell}">${c !== "companies" ? image(item.img_url || item.img_link, nameOf(item)) : `<span class="${a.brandDot}">${esc((nameOf(item) || "?").slice(0, 1))}</span>`}<span><bdi>${esc(nameOf(item))}</bdi><small dir="ltr">${esc(item.name_en)}</small></span></div></td><td>${c === "products" ? money(item.final_price) : c === "companies" ? number(data.products.filter((p) => p.company_id === item.id).length) : `<bdi>${esc(nameOf(data.companies.find((b) => b.id === item.company_id)))}</bdi>`}</td><td><div class="${a.tableActions}"><a class="${s.iconButton}" href="#/admin/${c}/edit/${encodeURIComponent(item.id)}" aria-label="${t("edit")}: ${esc(nameOf(item))}">${icon("edit")}</a><button type="button" class="${s.iconButton}" data-delete="${esc(item.id)}" aria-label="${t("delete")}: ${esc(nameOf(item))}">${icon("trash")}</button>${isBrands ? brandCsvActions(item) : ""}</div></td></tr>`).join("")}</tbody></table></div>${pagination(page.page, page.pages)}` : empty(q ? "noResults" : "empty", q ? "noResultsText" : "emptyText")}`;
}
function userList(users, q) {
  const usernameOf = (user) => user.username || user.user || user.email || "";
  const filtered = users.filter((u) =>
    matches({ name_ar: u.name || "", name_en: usernameOf(u) }, q),
  );
  return `<div class="${a.head}"><div><h1 tabindex="-1">${t("users")}</h1><p>${number(filtered.length)} ${t("results")}</p></div><a class="${s.button} ${s.primary}" href="#/admin/users/new">${icon("plus")}${t("add")}</a></div>${searchBox(q, "username")}<p id="admin-error" class="${s.error}" role="alert"></p>${filtered.length ? `<div class="${a.tableWrap}" tabindex="0" role="region" aria-label="${t("users")}"><table class="${a.table}"><thead><tr><th>${t("username")}</th><th>${t("active")}</th><th>${t("actions")}</th></tr></thead><tbody>${filtered.map((u) => `<tr><td><strong>${esc(u.name || "")}</strong><small dir="ltr">${esc(usernameOf(u))}</small></td><td><span class="${u.active === false ? a.inactive : a.active}">${u.active === false ? t("disableUser") : t("active")}</span></td><td><a class="${s.iconButton}" href="#/admin/users/edit/${encodeURIComponent(u.id)}" aria-label="${t("edit")}: ${esc(u.name || usernameOf(u))}">${icon("edit")}</a></td></tr>`).join("")}</tbody></table></div>` : empty(q ? "noResults" : "empty", q ? "noResultsText" : "emptyText")}`;
}
function imageFields(c, item, imgKey) {
  const imageLabel = c === "products" ? "productImageUrl" : "imageUrl";
  return `${field("image_url", imageLabel, item[imgKey]?.startsWith("https://") ? item[imgKey] : "", { type: "url", full: true, dir: "ltr" })}<div class="${a.mediaField} ${a.field} ${a.full}"><label for="field-image-file">${t("upload")}</label><input id="field-image-file" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="image-help field-image-file-error" /><small id="image-help">${t("imageHelp")}</small><span id="field-image-file-error" class="${s.error}"></span>${image(item[imgKey] || "./assets/image-fallback.svg", t("preview"), a.preview)}</div>`;
}
function editor(data, route, c) {
  const edit = route.parts[2] === "edit";
  const item = edit ? data[c].find((x) => x.id === route.parts[3]) : {};
  if (!item) return notFound();
  const imgKey =
    c === "companies" ? "logo_url" : c === "products" ? "img_url" : "img_link";
  const parents =
    c === "companies"
      ? selectField(
          "parent_id",
          "parentBrand",
          [
            ["", t("noParent")],
            ...data.companies
              .filter((b) => b.id !== item.id)
              .map((b) => [b.id, nameOf(b)]),
          ],
          item.parent_id || "",
          false,
        )
      : "";
  return `<div class="${a.head}"><h1 tabindex="-1">${t(edit ? "editItem" : "newItem")} · ${t(labelFor(c))}</h1></div>${c !== "companies" && !data.companies.length ? `<p class="${s.banner}">${t("noBrands")}</p>` : ""}<form id="editor-form" class="${a.form}" novalidate data-collection="${c}" data-id="${esc(item.id || "")}" data-revision="${item.revision || 0}"><div class="${a.formGrid}">${field("name_ar", "nameAr", item.name_ar, { required: true, dir: "rtl", extra: 'maxlength="180"' })}${field("name_en", "nameEn", item.name_en, { required: true, dir: "ltr", extra: 'maxlength="180"' })}${c === "companies" ? `${field("phone", "phone", item.phone, { type: "tel", dir: "ltr", extra: 'maxlength="30"' })}${parents}` : selectField("company_id", "brand", [["", t("chooseBrand")], ...data.companies.map((b) => [b.id, nameOf(b)])], item.company_id || "")}${
    c === "products"
      ? `${field("size_value", "sizeValue", item.size_value, { required: true, type: "number", extra: 'min="0.01" max="100000" step="0.01"' })}${selectField(
          "size_unit",
          "sizeUnit",
          [
            ["ml", t("ml")],
            ["g", t("g")],
          ],
          item.size_unit || "ml",
        )}${field("final_price", "price", item.final_price, { required: true, type: "number", extra: 'min="0" max="10000000" step="0.01"' })}${field("qty", "qty", item.qty, { type: "number", extra: 'min="1" max="100000" step="1"' })}${field("discount", "discountField", item.discount, { type: "number", extra: 'min="0" max="100" step="0.01"' })}${field("product_url", "productPageUrl", item.product_url, { type: "url", full: true, dir: "ltr" })}`
      : ""
  }${c === "offers" ? `${field("description_ar", "descriptionAr", item.description_ar, { required: true, dir: "rtl", extra: 'maxlength="300"' })}${field("description_en", "descriptionEn", item.description_en, { required: true, dir: "ltr", extra: 'maxlength="300"' })}` : ""}${imageFields(c, item, imgKey)}</div><p id="form-error" role="alert" class="${a.errorSummary}"></p><div class="${a.formActions}"><button type="submit" class="${s.button} ${s.primary}" ${c !== "companies" && !data.companies.length ? "disabled" : ""}>${t("save")}</button><a class="${s.button} ${s.secondary}" href="#/admin/${c}">${t("cancel")}</a></div></form>`;
}
function userEditor(users, route) {
  const edit = route.parts[2] === "edit";
  const item = edit ? users.find((u) => u.id === route.parts[3]) : {};
  if (!item) return notFound();
  const username = item.username || item.user || item.email || "";
  return `<div class="${a.head}"><h1 tabindex="-1">${t(edit ? "updateUser" : "createUser")}</h1></div><p class="${a.note}">${t("passwordNeverShown")}</p><form id="user-form" class="${a.form}" novalidate data-id="${esc(item.id || "")}" data-revision="${esc(item.revision || 1)}"><div class="${a.formGrid}">${field("name", "nameEn", item.name, { required: true })}${field("user", "username", username, { required: true, dir: "ltr", extra: `${edit ? "readonly" : ""} autocomplete="username"` })}${field("phone", "phone", item.phone, { type: "tel", dir: "ltr" })}${field("password", edit ? "resetPassword" : "password", "", { type: "password", required: !edit, dir: "ltr", extra: 'autocomplete="new-password"' })}${edit ? `<div class="${a.field}"><label for="field-active">${t("active")}</label><select id="field-active" name="active"><option value="true" ${item.active !== false ? "selected" : ""}>${t("enableUser")}</option><option value="false" ${item.active === false ? "selected" : ""}>${t("disableUser")}</option></select></div>` : ""}</div><p id="user-form-error" role="alert" class="${a.errorSummary}"></p><div class="${a.formActions}"><button type="submit" class="${s.button} ${s.primary}">${t("save")}</button><a class="${s.button} ${s.secondary}" href="#/admin/users">${t("cancel")}</a></div></form>`;
}
function imageLibrary() {
  return `<div class="${a.utilityPage}"><div class="${a.head}"><div><span class="${a.eyebrow}">${t("admin")}</span><h1 tabindex="-1">${t("imageLibrary")}</h1><p>${t("imageLibraryText")}</p></div></div><section class="${a.uploadHero}"><label class="${a.dropZone}" for="bulk-image-input" tabindex="0" role="button" aria-controls="bulk-image-input"><span class="${a.dropIcon}">${icon("image")}</span><strong>${t("dropImages")}</strong><small>${t("imageBatchHelp")}</small><span class="${s.button} ${s.secondary}">${t("chooseImages")}</span><input id="bulk-image-input" type="file" accept="image/jpeg,image/png,image/webp" multiple /></label><div class="${a.batchActions}"><span id="bulk-image-count" class="${a.listHint}"></span><button type="button" id="bulk-image-upload" class="${s.button} ${s.primary}" disabled>${t("uploadAll")}</button><button type="button" id="bulk-copy-urls" class="${s.button} ${s.secondary}" disabled>${t("copyAllUrls")}</button><button type="button" id="bulk-download-map" class="${s.button} ${s.secondary}" disabled>${t("downloadImageMap")}</button></div><p id="bulk-image-status" class="${a.status}" role="status" aria-live="polite"></p><div id="bulk-image-list" class="${a.uploadList}"></div></section></div>`;
}
function importPreview(result) {
  if (!result) return "";
  const rows = result.rows || [];
  const errors = rows.filter((row) => row.errors?.length);
  return `<section class="${a.importPanel}" aria-labelledby="import-preview-title"><div class="${a.importPanelHead}"><div><span class="${a.eyebrow}">${t("importPreview")}</span><h2 id="import-preview-title">${result.ok ? t("importReady") : t("importRowError")}</h2></div><div class="${a.importStats}"><span><b>${number(result.created || 0)}</b>${t("importCreated")}</span><span><b>${number(result.updated || 0)}</b>${t("importUpdated")}</span><span><b>${number(result.unchanged || 0)}</b>${t("importUnchanged")}</span><span class="${errors.length ? a.statDanger : ""}"><b>${number(result.errors || errors.length)}</b>${t("importErrors")}</span></div></div>${
    errors.length
      ? `<ul class="${a.importErrors}">${errors
          .slice(0, 8)
          .map(
            (row) =>
              `<li><b>${t("importRows")} ${number(row.row)}</b> ${esc(row.errors.join(" · "))}</li>`,
          )
          .join("")}</ul>`
      : `<p class="${a.status}">${t("importReady")}</p>`
  }${rows.length ? `<div class="${a.importActions}"><button type="button" class="${s.button} ${s.secondary}" id="download-import-result" onclick="this.dispatchEvent(new Event('clinic-download-import-result'))">${t("downloadImportResult")}</button></div>` : ""}</section>`;
}
const importResultColumns = ["row", "product_id", "action", "errors"];
function bindImportResult(root, result, brand, signal) {
  root.querySelector("#download-import-result")?.addEventListener(
    "click",
    () =>
      downloadCsv(
        `${fileName(brand.name_en)}-import-result.csv`,
        (result.rows || []).map((row) => ({
          row: row.row,
          product_id: row.product_id || "",
          action: row.action || "",
          errors: (row.errors || []).join(" · "),
        })),
        importResultColumns,
      ),
    { signal },
  );
}
function importErrorMessage(error) {
  const messages = {
    csv_encoding: "csvEncodingError",
    csv_empty: "csvEmptyError",
    csv_empty_header: "csvEmptyHeaderError",
    csv_duplicate_headers: "csvDuplicateHeaderError",
    csv_missing_columns: "csvMissingColumnsError",
    csv_extra_fields: "csvExtraFieldsError",
    csv_unfinished_quote: "csvUnfinishedQuoteError",
  };
  const key = messages[error?.code];
  return key ? t(key) : error?.message || t("importFailed");
}
export function adminPage(data, route, authState) {
  const c = route.parts[1];
  if (c && ![...collections, "users", "images"].includes(c)) return notFound();
  const content = !c
    ? overview(data, authState)
    : c === "images"
      ? imageLibrary()
      : c === "users"
        ? route.parts[2]
          ? userEditor(authState.users || [], route)
          : `${authState.usersError ? `<p id="admin-error" class="${s.error}" role="alert">${t("userError")} <button type="button" id="retry-users" class="${s.ghost}" onclick="this.dispatchEvent(new Event('clinic-retry-users'))">${t("retry")}</button></p>` : ""}${list(data, route, c, authState.users || [])}`
        : route.parts[2]
          ? ["new", "edit"].includes(route.parts[2])
            ? editor(data, route, c)
            : notFound()
          : list(data, route, c);
  const csvTools =
    c === "companies"
      ? `<input id="brand-import-file" type="file" accept=".csv,text/csv" hidden /><div id="brand-import-preview"></div>`
      : "";
  return `<div class="${a.layout}">${sidebar(route, authState)}<section>${content}${csvTools}</section></div>`;
}
const errorMessage = (error) => {
  const code = error?.code || error?.message;
  if (code === "conflict" || code === "inUse") return t(code);
  if (code === "unconfigured" || code === "storage_not_configured")
    return t("uploadNotConfigured");
  if (code === "storage_upload_failed") return t("uploadFailed");
  if (code === "output_too_large") return t("uploadTooLarge");
  if (code === "dimensions" || code === "invalid_image")
    return t("imageProcessingError");
  if (code === "timeout") return t("uploadTimeout");
  if (code === "demo_import_unavailable") return t("importDemoUnavailable");
  return t("saveError");
};
async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "true");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
}
function bindBrandCsv(root, data, signal, render) {
  const fileInput = root.querySelector("#brand-import-file");
  const previewRoot = root.querySelector("#brand-import-preview");
  let pending = null;
  let previewRequest = 0;
  let applying = false;
  const importButtons = [...root.querySelectorAll("[data-import-brand]")];

  const setImportControlsDisabled = (disabled) => {
    importButtons.forEach((button) => {
      button.disabled = disabled;
    });
    if (fileInput) fileInput.disabled = disabled;
  };
  root.querySelectorAll("[data-export-brand]").forEach((button) =>
    button.addEventListener(
      "click",
      () => {
        const brand = data.companies.find(
          (item) => item.id === button.dataset.exportBrand,
        );
        if (!brand) return;
        const products = data.products.filter(
          (item) => item.company_id === brand.id,
        );
        downloadCsv(
          `${fileName(brand.name_en)}-products.csv`,
          productExportRows(brand, products),
        );
        notify(t("saved"));
      },
      { signal },
    ),
  );
  root.querySelectorAll("[data-template-brand]").forEach((button) =>
    button.addEventListener(
      "click",
      () => {
        const brand = data.companies.find(
          (item) => item.id === button.dataset.templateBrand,
        );
        if (!brand) return;
        downloadCsv(
          `${fileName(brand.name_en)}-products-template.csv`,
          productTemplateRows(brand),
        );
      },
      { signal },
    ),
  );
  root.querySelectorAll("[data-import-brand]").forEach((button) =>
    button.addEventListener(
      "click",
      () => {
        if (!fileInput || applying) return;
        fileInput.dataset.brandId = button.dataset.importBrand;
        fileInput.value = "";
        fileInput.click();
      },
      { signal },
    ),
  );
  fileInput?.addEventListener(
    "change",
    async () => {
      if (applying) return;
      const requestId = ++previewRequest;
      const file = fileInput.files?.[0];
      const brand = data.companies.find(
        (item) => item.id === fileInput.dataset.brandId,
      );
      if (!file || !brand || !previewRoot) return;
      pending = null;
      previewRoot.innerHTML = `<p class="${a.status}">${t("loading")}</p>`;
      if (file.size > MAX_IMPORT_FILE_BYTES) {
        previewRoot.innerHTML = `<p class="${s.error}" role="alert">${t("importFileTooLarge")}</p>`;
        return;
      }
      try {
        const rows = importRows(parseCsv(await readCsvFile(file)), brand);
        if (requestId !== previewRequest) return;
        if (rows.some((row) => row.brand_id && row.brand_id !== brand.id)) {
          previewRoot.innerHTML = `<p class="${s.error}" role="alert">${t("importBrandMismatch")}</p>`;
          return;
        }
        if (!rows.length) {
          previewRoot.innerHTML = `<p class="${s.error}" role="alert">${t("importEmpty")}</p>`;
          return;
        }
        if (rows.length > MAX_IMPORT_ROWS) {
          previewRoot.innerHTML = `<p class="${s.error}" role="alert">${t("importTooManyRows")}</p>`;
          return;
        }
        const payloadBytes = new TextEncoder().encode(
          JSON.stringify(rows),
        ).byteLength;
        if (payloadBytes > MAX_IMPORT_PAYLOAD_BYTES) {
          previewRoot.innerHTML = `<p class="${s.error}" role="alert">${t("importPayloadTooLarge")}</p>`;
          return;
        }
        previewRoot.innerHTML = `<p class="${a.status}">${t("loading")}</p>`;
        const result = await importBrandProducts(brand.id, rows, true);
        if (requestId !== previewRequest) return;
        pending = result.ok ? { brand, rows } : null;
        previewRoot.innerHTML = `${importPreview(result)}${result.ok ? `<div class="${a.importActions}"><button type="button" class="${s.button} ${s.primary}" id="apply-brand-import">${t("applyImport")}</button></div>` : ""}`;
        bindImportResult(previewRoot, result, brand, signal);
        previewRoot.querySelector("#apply-brand-import")?.addEventListener(
          "click",
          async (event) => {
            if (!pending || applying) return;
            const batch = pending;
            const applyButton = event.currentTarget;
            applying = true;
            setImportControlsDisabled(true);
            applyButton.disabled = true;
            let applied;
            try {
              applied = await importBrandProducts(
                batch.brand.id,
                batch.rows,
                false,
              );
            } catch (error) {
              applyButton.disabled = false;
              previewRoot.querySelector("[data-import-apply-error]")?.remove();
              previewRoot.insertAdjacentHTML(
                "afterbegin",
                `<p data-import-apply-error class="${s.error}" role="alert">${esc(error?.message || t("importFailed"))}</p>`,
              );
              return;
            } finally {
              applying = false;
              setImportControlsDisabled(false);
            }

            pending = null;
            previewRoot.innerHTML = importPreview(applied);
            bindImportResult(previewRoot, applied, batch.brand, signal);
            if (!applied.ok) return;
            notify(t("importApplied"));
            await render();
          },
          { signal },
        );
      } catch (error) {
        if (requestId !== previewRequest) return;
        previewRoot.innerHTML = `<p class="${s.error}" role="alert">${esc(importErrorMessage(error))}</p>`;
      }
    },
    { signal },
  );
}
function bindBulkUploader(root, signal) {
  const input = root.querySelector("#bulk-image-input");
  const list = root.querySelector("#bulk-image-list");
  const upload = root.querySelector("#bulk-image-upload");
  const copyAll = root.querySelector("#bulk-copy-urls");
  const downloadMap = root.querySelector("#bulk-download-map");
  const count = root.querySelector("#bulk-image-count");
  const status = root.querySelector("#bulk-image-status");
  if (!input || !list) return;
  const items = [];
  let processing = false;
  signal.addEventListener(
    "abort",
    () =>
      items.forEach(
        (item) => item.preview && URL.revokeObjectURL(item.preview),
      ),
    { once: true },
  );
  const render = () => {
    count.textContent = items.length
      ? `${number(items.length)} ${t("importRows")}`
      : "";
    const complete = items.filter((item) => item.url);
    upload.disabled =
      processing ||
      !items.some(
        (item) => item.status === "queued" || item.status === "error",
      );
    copyAll.disabled = !complete.length;
    downloadMap.disabled = !complete.length;
    list.innerHTML = items
      .map(
        (item, index) =>
          `<article class="${a.uploadRow}" data-upload-row="${index}"><img src="${esc(item.preview)}" alt="" /><div class="${a.uploadMeta}"><strong title="${esc(item.file.name)}">${esc(item.file.name)}</strong><small>${number(Math.round(item.file.size / 1024))} KB · ${esc(item.statusLabel)}</small>${item.url ? `<code dir="ltr">${esc(item.url)}</code>` : ""}${item.error ? `<span class="${s.error}">${esc(item.error)}</span>` : ""}</div><div class="${a.uploadRowActions}">${item.url ? `<button type="button" class="${s.compactButton}" data-copy-upload="${index}" onclick="this.dispatchEvent(new Event('clinic-copy-upload'))">${t("copy")}</button>` : ""}${item.status === "error" ? `<button type="button" class="${s.compactButton}" data-retry-upload="${index}" onclick="this.dispatchEvent(new Event('clinic-retry-upload'))">${t("retry")}</button>` : ""}<button type="button" class="${s.iconButton}" data-remove-upload="${index}" aria-label="${t("cancel")}" onclick="this.dispatchEvent(new Event('clinic-remove-upload'))">${icon("close")}</button></div></article>`,
      )
      .join("");
    list.querySelectorAll("[data-copy-upload]").forEach((button) =>
      button.addEventListener("click", async () => {
        await copyText(items[Number(button.dataset.copyUpload)].url);
        notify(t("urlCopied"));
      }),
    );
    list.querySelectorAll("[data-remove-upload]").forEach((button) =>
      button.addEventListener("click", () => {
        const [item] = items.splice(Number(button.dataset.removeUpload), 1);
        if (item?.preview) URL.revokeObjectURL(item.preview);
        render();
      }),
    );
    list.querySelectorAll("[data-retry-upload]").forEach((button) =>
      button.addEventListener("click", () => {
        const item = items[Number(button.dataset.retryUpload)];
        if (item) {
          item.status = "queued";
          item.statusLabel = t("imageQueued");
          item.error = "";
          render();
        }
      }),
    );
  };
  const addFiles = (files) => {
    for (const file of [...files].slice(0, Math.max(0, 100 - items.length))) {
      items.push({
        file,
        preview: URL.createObjectURL(file),
        status: "queued",
        statusLabel: t("imageQueued"),
        url: "",
        error: "",
      });
    }
    render();
  };
  input.addEventListener(
    "change",
    () => {
      addFiles(input.files);
      input.value = "";
    },
    { signal },
  );
  root.querySelector(`.${a.dropZone}`)?.addEventListener(
    "dragover",
    (event) => {
      event.preventDefault();
      event.currentTarget.classList.add(a.dragging);
    },
    { signal },
  );
  root
    .querySelector(`.${a.dropZone}`)
    ?.addEventListener(
      "dragleave",
      (event) => event.currentTarget.classList.remove(a.dragging),
      { signal },
    );
  root.querySelector(`.${a.dropZone}`)?.addEventListener(
    "drop",
    (event) => {
      event.preventDefault();
      event.currentTarget.classList.remove(a.dragging);
      addFiles(event.dataTransfer.files);
    },
    { signal },
  );
  const processQueue = async () => {
    if (processing) return;
    const queue = items.filter(
      (item) => item.status === "queued" || item.status === "error",
    );
    if (!queue.length) return;
    processing = true;
    render();
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const item = queue[cursor++];
        item.status = "preparing";
        item.statusLabel = t("imagePreparing");
        item.error = "";
        render();
        let prepared;
        try {
          prepared = await prepareImage(item.file, { signal });
          item.statusLabel = t("uploading");
          render();
          const result = await uploadImage(prepared, { signal });
          item.url = result.url;
          item.status = "success";
          item.statusLabel = t("imageUploaded");
          releaseImage(prepared);
        } catch (error) {
          item.status = "error";
          item.statusLabel = t("imageUploadError");
          item.error = errorMessage(error);
          if (prepared) releaseImage(prepared);
        }
        render();
      }
    };
    try {
      await Promise.all([worker(), worker(), worker()]);
      status.textContent = t("imageUploaded");
    } finally {
      processing = false;
      render();
    }
  };
  upload.addEventListener("click", () => processQueue(), { signal });
  root.querySelector(`.${a.dropZone}`)?.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      input.click();
    },
    { signal },
  );
  copyAll.addEventListener(
    "click",
    async () => {
      await copyText(
        items
          .filter((item) => item.url)
          .map((item) => item.url)
          .join("\n"),
      );
      notify(t("urlsCopied"));
    },
    { signal },
  );
  downloadMap.addEventListener(
    "click",
    () => {
      const rows = items
        .filter((item) => item.url)
        .map((item, index) => ({
          position: index + 1,
          original_filename: item.file.name,
          image_url: item.url,
        }));
      downloadCsv("clinic-image-map.csv", rows, [
        "position",
        "original_filename",
        "image_url",
      ]);
    },
    { signal },
  );
  render();
}
export function bindAdmin(root, data, route, context) {
  const { signal, render, navigate, authState } = context;
  if (route.parts[1] === "images") bindBulkUploader(root, signal);
  if (route.parts[1] === "companies") bindBrandCsv(root, data, signal, render);
  root.querySelectorAll("[data-delete]").forEach((btn) =>
    btn.addEventListener(
      "click",
      async () => {
        const c = route.parts[1];
        const item = data[c].find((x) => x.id === btn.dataset.delete);
        if (
          !(await ask(
            `${t("deleteQuestion")} ${nameOf(item)}`,
            t("deleteText"),
            t("delete"),
          ))
        )
          return;
        btn.disabled = true;
        try {
          await deleteItem(c, item.id, item.revision);
          notify(t("deleted"));
          await render();
        } catch (error) {
          root.querySelector("#admin-error").textContent = errorMessage(error);
          btn.disabled = false;
        }
      },
      { signal },
    ),
  );
  root.querySelector("#reset-demo")?.addEventListener(
    "click",
    async (event) => {
      if (!(await ask(t("resetQuestion"), t("resetText"), t("reset")))) return;
      event.target.disabled = true;
      try {
        await resetStore();
        notify(t("resetDone"));
        await render();
      } catch (error) {
        root.querySelector("#admin-error").textContent = errorMessage(error);
        event.target.disabled = false;
      }
    },
    { signal },
  );
  const form = root.querySelector("#editor-form");
  if (form) bindEditor(root, form, data, context);
  const userForm = root.querySelector("#user-form");
  if (userForm) bindUserEditor(root, userForm, authState.users || [], context);
  root.querySelector("#retry-users")?.addEventListener(
    "clinic-retry-users",
    async (event) => {
      event.currentTarget.disabled = true;
      authState.users = undefined;
      authState.usersError = false;
      await render();
    },
    { signal },
  );
}
function bindEditor(root, form, data, context) {
  const { signal, navigate } = context;
  const c = form.dataset.collection;
  const item = data[c].find((x) => x.id === form.dataset.id) || {};
  const imgKey =
    c === "companies" ? "logo_url" : c === "products" ? "img_url" : "img_link";
  let chosenImage = item[imgKey] || "";
  let prepared = null;
  let uploadedImage = null;
  let prepareController = null;
  let imageGeneration = 0;
  let catalogWriteAttempted = false;
  let imageIssue = false;
  let imagePending = false;
  const releasePrepared = () => {
    if (prepared) releaseImage(prepared);
    prepared = null;
  };
  const clearImageChoice = () => {
    imageGeneration += 1;
    prepareController?.abort();
    prepareController = null;
    releasePrepared();
    uploadedImage = null;
    imagePending = false;
  };
  const cleanupPendingUpload = () => {
    imageGeneration += 1;
    prepareController?.abort();
    prepareController = null;
    releasePrepared();
    // A save request can still commit after navigation starts. Let its
    // reference remain discoverable instead of deleting during that window.
    if (
      form.dataset.busy !== "true" &&
      !catalogWriteAttempted &&
      uploadedImage?.url
    )
      scheduleManagedImageCleanup(uploadedImage.url);
    uploadedImage = null;
  };
  signal.addEventListener("abort", cleanupPendingUpload, { once: true });
  form.addEventListener(
    "input",
    () => {
      dirty = true;
    },
    { signal },
  );
  const showError = (input, message) => {
    input.setAttribute("aria-invalid", "true");
    root
      .querySelector(`#${input.id}-error`)
      ?.replaceChildren(document.createTextNode(message));
  };
  form.elements.image_url.addEventListener(
    "change",
    () => {
      clearImageChoice();
      const value = safeExternalUrl(form.elements.image_url.value.trim());
      if (value) {
        chosenImage = value;
        root.querySelector(`.${a.preview}`).src = value;
        form.querySelector("#field-image-file").value = "";
        imageIssue = false;
      } else {
        chosenImage = "";
      }
    },
    { signal },
  );
  form.querySelector("#field-image-file").addEventListener(
    "change",
    async (event) => {
      dirty = true;
      const input = event.target;
      const file = input.files[0];
      if (!file) return;
      clearImageChoice();
      const generation = imageGeneration;
      const preparation = new AbortController();
      prepareController = preparation;
      imagePending = true;
      imageIssue = false;
      root.querySelector("#field-image-file-error").textContent = "";
      try {
        const nextPrepared = await prepareImage(file, {
          signal: preparation.signal,
        });
        if (generation !== imageGeneration) {
          releaseImage(nextPrepared);
          return;
        }
        prepared = nextPrepared;
        chosenImage = "";
        root.querySelector(`.${a.preview}`).src = prepared.previewUrl;
        form.elements.image_url.value = "";
      } catch {
        if (generation === imageGeneration) {
          imageIssue = true;
          showError(input, t("invalidImage"));
        }
      } finally {
        if (prepareController === preparation) prepareController = null;
        if (generation === imageGeneration) imagePending = false;
      }
    },
    { signal },
  );
  form.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      if (form.dataset.busy === "true" || imagePending) return;
      form
        .querySelectorAll("[aria-invalid]")
        .forEach((x) => x.removeAttribute("aria-invalid"));
      form.querySelectorAll(`.${s.error}`).forEach((x) => {
        x.textContent = "";
      });
      root.querySelector("#form-error").textContent = "";
      let firstInvalid;
      const invalid = (input, message) => {
        showError(input, message);
        firstInvalid ||= input;
      };
      for (const input of [...form.elements].filter(
        (x) => x.name && x.name !== "image_url",
      )) {
        if (input.required && !input.value.trim()) {
          invalid(input, t("required"));
          continue;
        }
        if (
          input.type === "number" &&
          input.value !== "" &&
          (!Number.isFinite(Number(input.value)) || !input.validity.valid)
        )
          invalid(input, t("invalidNumber"));
      }
      const url = safeExternalUrl(form.elements.image_url.value.trim());
      if (form.elements.image_url.value.trim() && !url)
        invalid(form.elements.image_url, t("invalidUrl"));
      if (c !== "companies" && !prepared && !chosenImage && !url)
        invalid(form.elements.image_url, t("required"));
      if (imageIssue)
        invalid(form.querySelector("#field-image-file"), t("invalidImage"));
      if (firstInvalid) {
        firstInvalid.focus();
        return;
      }
      const values = Object.fromEntries(new FormData(form));
      const record = {
        ...item,
        id: item.id || crypto.randomUUID(),
        name_ar: values.name_ar.trim(),
        name_en: values.name_en.trim(),
        [imgKey]: url || chosenImage,
      };
      if (c === "companies")
        Object.assign(record, {
          phone: values.phone.trim(),
          parent_id: values.parent_id || null,
        });
      else record.company_id = values.company_id;
      if (c === "products")
        Object.assign(record, {
          size_value: Number(values.size_value),
          size_unit: values.size_unit,
          final_price: Number(values.final_price),
          qty: values.qty === "" ? null : Number(values.qty),
          discount: values.discount === "" ? null : Number(values.discount),
          product_url: values.product_url
            ? safeExternalUrl(values.product_url.trim()) || null
            : null,
        });
      if (c === "offers")
        Object.assign(record, {
          description_ar: values.description_ar.trim(),
          description_en: values.description_en.trim(),
        });
      const submit = form.querySelector("[type=submit]");
      form.dataset.busy = "true";
      submit.disabled = true;
      submit.setAttribute("aria-busy", "true");
      const original = submit.innerHTML;
      // Freeze the submitted image choice until its upload and write settle.
      const controls = [...form.elements].map((field) => [
        field,
        field.disabled,
      ]);
      controls.forEach(([field]) => {
        field.disabled = true;
      });
      try {
        if (prepared) {
          if (!uploadedImage) {
            submit.textContent = t("uploading");
            uploadedImage = await uploadImage(prepared, {
              signal,
              onProgress: (value) => {
                submit.textContent =
                  value > 0 && value < 1
                    ? `${t("uploading")} ${Math.round(value * 100)}%`
                    : t("uploading");
              },
            });
          }
          record[imgKey] = uploadedImage.url;
        }
        if (signal.aborted) {
          const cancelled = new Error("Upload cancelled");
          cancelled.code = "aborted";
          throw cancelled;
        }
        catalogWriteAttempted = true;
        submit.textContent = t("saving");
        await saveItem(c, record, Number(form.dataset.revision));
        if (signal.aborted) return;
        dirty = false;
        releasePrepared();
        uploadedImage = null;
        notify(t("saved"));
        navigate(`#/admin/${c}`);
      } catch (error) {
        if (signal.aborted) return;
        controls.forEach(([field, disabled]) => {
          field.disabled = disabled;
        });
        root.querySelector("#form-error").textContent = errorMessage(error);
        submit.disabled = false;
        submit.removeAttribute("aria-busy");
        submit.innerHTML = original;
        form.dataset.busy = "false";
      }
    },
    { signal },
  );
}
function bindUserEditor(root, form, users, context) {
  const { signal, navigate } = context;
  form.addEventListener(
    "input",
    () => {
      dirty = true;
    },
    { signal },
  );
  form.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      if (form.dataset.busy === "true") return;
      const values = Object.fromEntries(new FormData(form));
      const password = values.password?.trim();
      if (
        !values.name?.trim() ||
        !values.user?.trim() ||
        (!form.dataset.id && !password)
      ) {
        root.querySelector("#user-form-error").textContent = t("required");
        return;
      }
      const submit = form.querySelector("[type=submit]");
      const original = submit.textContent;
      form.dataset.busy = "true";
      submit.disabled = true;
      submit.setAttribute("aria-busy", "true");
      submit.textContent = t("saving");
      try {
        if (form.dataset.id)
          await updateUser(form.dataset.id, {
            name: values.name.trim(),
            phone: values.phone.trim(),
            active: values.active !== "false",
            expectedRevision: Number(form.dataset.revision) || 1,
            ...(password ? { password } : {}),
          });
        else
          await createUser({
            name: values.name.trim(),
            user: values.user.trim(),
            password,
            phone: values.phone.trim(),
          });
        dirty = false;
        notify(t("userSaved"));
        navigate("#/admin/users");
      } catch (error) {
        root.querySelector("#user-form-error").textContent =
          error?.message || t("userError");
        submit.disabled = false;
        submit.removeAttribute("aria-busy");
        submit.textContent = original;
        form.dataset.busy = "false";
      }
    },
    { signal },
  );
}
