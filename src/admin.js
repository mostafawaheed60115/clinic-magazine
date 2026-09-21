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
import { collections, saveItem, deleteItem, resetStore } from "./store.js";
import { loadUsers, createUser, updateUser, signOut } from "./auth.js";
import { prepareImage, uploadImage, releaseImage } from "./upload.js";
import { notFound } from "./pages.js";
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
const field = (key, label, value = "", options = {}) => {
  const id = `field-${key}`;
  return `<div class="${a.field} ${options.full ? a.full : ""}"><label for="${id}">${t(label)}</label><input id="${id}" name="${key}" value="${esc(value)}" type="${options.type || "text"}" ${options.required ? "required" : ""} ${options.dir ? `dir="${options.dir}"` : ""} ${options.extra || ""} aria-describedby="${id}-error" /><span class="${s.error}" id="${id}-error"></span></div>`;
};
const selectField = (key, label, options, value = "", required = true) =>
  `<div class="${a.field}"><label for="field-${key}">${t(label)}</label><select id="field-${key}" name="${key}" ${required ? "required" : ""} aria-describedby="field-${key}-error">${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`).join("")}</select><span id="field-${key}-error" class="${s.error}"></span></div>`;

function sidebar(route, authState) {
  const nav = [...collections, ...(authState.isAdmin ? ["users"] : [])];
  return `<aside class="${a.sidebar}"><nav aria-label="${t("admin")}"><a href="#/admin" ${!route.parts[1] ? 'aria-current="page"' : ""}>${icon("grid")}${t("overview")}</a>${nav.map((c) => `<a href="#/admin/${c}" ${route.parts[1] === c ? 'aria-current="page"' : ""}>${icon(c === "products" ? "bag" : c === "users" ? "user" : "grid")}${t(labelFor(c))}</a>`).join("")}</nav><small>${authState.mode === "demo" ? t("localOnly") : t("cloudManaged")}</small>${button(t("signOut"), 'id="app-sign-out"', "ghost")}</aside>`;
}
function overview(data, authState) {
  const reset =
    authState.mode === "demo" ? button(t("reset"), 'id="reset-demo"') : "";
  return `<div class="${a.head}"><div><h1 tabindex="-1">${t("overview")}</h1><p>${t("manageText")}</p></div></div>${authState.mode === "demo" ? `<p class="${s.banner}">${t("demoWarning")}</p>` : ""}<div class="${a.metrics}">${collections.map((c) => `<section class="${a.metric}"><strong>${number(data[c].length)}</strong><span>${t(labelFor(c))}</span><a href="#/admin/${c}">${t("manage")}${arrow()}</a></section>`).join("")}</div>${reset}<p id="admin-error" role="alert" class="${s.error}"></p>`;
}
function list(data, route, c, users = []) {
  const q = route.params.get("q") || "";
  if (c === "users") return userList(users, q);
  const page = paginate(
    data[c].filter((item) => matches(item, q)),
    route,
    8,
  );
  return `<div class="${a.head}"><div><h1 tabindex="-1">${t(labelFor(c))}</h1><p>${number(page.total)} ${t("results")}</p></div><a class="${s.button} ${s.primary}" href="#/admin/${c}/new">${icon("plus")}${t("add")}</a></div>${searchBox(q, c === "products" ? "searchProducts" : "searchBrands")}<p id="admin-error" class="${s.error}" role="alert"></p>${page.total ? `<div class="${a.tableWrap}" tabindex="0" role="region" aria-label="${t(labelFor(c))}"><table class="${a.table}"><thead><tr><th scope="col">${t(locale === "ar" ? "nameAr" : "nameEn")}</th><th scope="col">${t(c === "products" ? "finalPrice" : c === "companies" ? "products" : "brand")}</th><th scope="col">${t("actions")}</th></tr></thead><tbody>${page.items.map((item) => `<tr><td><div class="${a.imageCell}">${c !== "companies" ? image(item.img_url || item.img_link, nameOf(item)) : ""}<span>${esc(nameOf(item))}<small dir="ltr">${esc(item.name_en)}</small></span></div></td><td>${c === "products" ? money(item.final_price) : c === "companies" ? number(data.products.filter((p) => p.company_id === item.id).length) : esc(nameOf(data.companies.find((b) => b.id === item.company_id)))}</td><td><div class="${a.tableActions}"><a class="${s.iconButton}" href="#/admin/${c}/edit/${encodeURIComponent(item.id)}" aria-label="${t("edit")}: ${esc(nameOf(item))}">${icon("edit")}</a><button type="button" class="${s.iconButton}" data-delete="${esc(item.id)}" aria-label="${t("delete")}: ${esc(nameOf(item))}">${icon("trash")}</button></div></td></tr>`).join("")}</tbody></table></div>${pagination(page.page, page.pages)}` : empty(q ? "noResults" : "empty", q ? "noResultsText" : "emptyText")}`;
}
function userList(users, q) {
  const usernameOf = (user) => user.username || user.user || user.email || "";
  const filtered = users.filter((u) =>
    matches({ name_ar: u.name || "", name_en: usernameOf(u) }, q),
  );
  return `<div class="${a.head}"><div><h1 tabindex="-1">${t("users")}</h1><p>${number(filtered.length)} ${t("results")}</p></div><a class="${s.button} ${s.primary}" href="#/admin/users/new">${icon("plus")}${t("add")}</a></div>${searchBox(q, "username")}<p id="admin-error" class="${s.error}" role="alert"></p>${filtered.length ? `<div class="${a.tableWrap}" tabindex="0" role="region" aria-label="${t("users")}"><table class="${a.table}"><thead><tr><th>${t("username")}</th><th>${t("active")}</th><th>${t("actions")}</th></tr></thead><tbody>${filtered.map((u) => `<tr><td><strong>${esc(u.name || "")}</strong><small dir="ltr">${esc(usernameOf(u))}</small></td><td><span class="${u.active === false ? a.inactive : a.active}">${u.active === false ? t("disableUser") : t("active")}</span></td><td><a class="${s.iconButton}" href="#/admin/users/edit/${encodeURIComponent(u.id)}" aria-label="${t("edit")}: ${esc(u.name || usernameOf(u))}">${icon("edit")}</a></td></tr>`).join("")}</tbody></table></div>` : empty(q ? "noResults" : "empty", q ? "noResultsText" : "emptyText")}`;
}
function imageFields(c, item, imgKey) {
  return `${field("image_url", "imageUrl", item[imgKey]?.startsWith("https://") ? item[imgKey] : "", { type: "url", full: true, dir: "ltr" })}<div class="${a.mediaField} ${a.field} ${a.full}"><label for="field-image-file">${t("upload")}</label><input id="field-image-file" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="image-help field-image-file-error" /><small id="image-help">${t("imageHelp")}</small><span id="field-image-file-error" class="${s.error}"></span>${image(item[imgKey] || "./assets/image-fallback.svg", t("preview"), a.preview)}</div>`;
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
        )}${field("final_price", "price", item.final_price, { required: true, type: "number", extra: 'min="0" max="10000000" step="0.01"' })}${field("qty", "qty", item.qty, { type: "number", extra: 'min="1" max="100000" step="1"' })}${field("discount", "discountField", item.discount, { type: "number", extra: 'min="0" max="100" step="0.01"' })}${field("product_url", "productUrl", item.product_url, { type: "url", full: true, dir: "ltr" })}`
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
export function adminPage(data, route, authState) {
  const c = route.parts[1];
  if (c && ![...collections, "users"].includes(c)) return notFound();
  const content = !c
    ? overview(data, authState)
    : c === "users"
      ? route.parts[2]
        ? userEditor(authState.users || [], route)
        : `${authState.usersError ? `<p id="admin-error" class="${s.error}" role="alert">${t("userError")} <button type="button" id="retry-users" class="${s.ghost}" onclick="this.dispatchEvent(new Event('clinic-retry-users'))">${t("retry")}</button></p>` : ""}${list(data, route, c, authState.users || [])}`
      : route.parts[2]
        ? ["new", "edit"].includes(route.parts[2])
          ? editor(data, route, c)
          : notFound()
        : list(data, route, c);
  return `<div class="${a.layout}">${sidebar(route, authState)}<section>${content}</section></div>`;
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
  return t("saveError");
};
export function bindAdmin(root, data, route, context) {
  const { signal, render, navigate, authState } = context;
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
  let imageIssue = false;
  let imagePending = false;
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
      const value = safeExternalUrl(form.elements.image_url.value.trim());
      if (value) {
        chosenImage = value;
        root.querySelector(`.${a.preview}`).src = value;
        form.querySelector("#field-image-file").value = "";
        imageIssue = false;
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
      imagePending = true;
      imageIssue = false;
      root.querySelector("#field-image-file-error").textContent = "";
      try {
        prepared = await prepareImage(file);
        root.querySelector(`.${a.preview}`).src = prepared.previewUrl;
        form.elements.image_url.value = "";
      } catch {
        imageIssue = true;
        showError(input, t("invalidImage"));
      } finally {
        imagePending = false;
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
            ? safeExternalUrl(values.product_url.trim())
            : "",
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
      try {
        if (prepared) {
          submit.textContent = t("uploading");
          const uploaded = await uploadImage(prepared, {
            onProgress: (value) => {
              submit.textContent = `${t("uploading")} ${Math.round(value)}%`;
            },
          });
          record[imgKey] = uploaded.url;
        }
        await saveItem(c, record, Number(form.dataset.revision));
        dirty = false;
        if (prepared) {
          releaseImage(prepared);
          prepared = null;
        }
        notify(t("saved"));
        navigate(`#/admin/${c}`);
      } catch (error) {
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
