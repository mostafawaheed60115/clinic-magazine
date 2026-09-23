import { t, locale, number } from "./i18n.js";
import s from "./styles/ui.module.css";

export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const paths = {
  arrow: "M5 12h14m-6-6 6 6-6 6",
  chevron: "m9 5 7 7-7 7",
  search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  close: "m6 6 12 12M6 18 18 6",
  plus: "M12 5v14M5 12h14",
  globe:
    "M3 12h18M12 2a16 16 0 0 1 0 20 16 16 0 0 1 0-20M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  bag: "M5 7h14l1 14H4L5 7Zm3 0V5a4 4 0 0 1 8 0v2",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  edit: "m15 4 5 5M4 20l4-1L21 6l-4-4L4 15v5Z",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  check: "m5 12 4 4L19 6",
  copy: "M9 9h10v10H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  external:
    "M14 4h6v6m-1-5L10 14M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5",
  user: "M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  image: "M4 5h16v14H4zM4 16l4-4 3 3 2-2 7 5M15 9h.01",
  whatsapp:
    "M20.4 11.5a8.4 8.4 0 0 1-12.2 7.4L3 20l1.2-5.1a8.4 8.4 0 1 1 16.2-3.4ZM8.3 7.8c-.3.2-.6.9-.5 1.4.2 1.6 2.7 4.6 4.8 5.5 1.1.5 2 .4 2.6 0l.7-1.1-2.1-1.1-.9 1c-1.5-.7-2.5-1.7-3.2-3.2l.9-.9-1-2.1-1.3.5Z",
};
export function icon(name, extra = "") {
  return `<svg class="${s.icon} ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.arrow}"/></svg>`;
}
export const arrow = () => icon("arrow", locale === "ar" ? s.flip : "");
export function link(href, label, kind = "primary") {
  return `<a class="${s.button} ${s[kind] || ""}" href="${esc(href)}">${esc(label)}${arrow()}</a>`;
}
export function button(label, attrs = "", kind = "secondary") {
  return `<button type="button" class="${s.button} ${s[kind] || ""}" ${attrs}>${esc(label)}</button>`;
}
export function image(src, alt, classes = "", loading = "lazy") {
  return `<img class="${classes}" src="${esc(safeImage(src))}" alt="${esc(alt)}" loading="${loading}" decoding="async" width="900" height="750" />`;
}
export function safeImage(src) {
  return /^(https:\/\/|blob:|data:image\/(?:png|jpeg|webp);base64,|(?:\.\/|\/)?assets\/)/i.test(
    src || "",
  )
    ? src
    : "./assets/image-fallback.svg";
}
export function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}
export function hydrateImages(root) {
  root.querySelectorAll("img").forEach((img) =>
    img.addEventListener(
      "error",
      () => {
        img.src = "./assets/image-fallback.svg";
        img.alt = t("unavailableImage");
      },
      { once: true },
    ),
  );
}
export function empty(
  title = "empty",
  description = "emptyText",
  modifier = "",
) {
  return `<section class="${s.empty} ${modifier}">${icon("search")}<h2>${t(title)}</h2><p>${t(description)}</p></section>`;
}
export function searchBox(value, placeholder) {
  return `<form id="search-form" class="${s.search}" role="search" novalidate><label class="${s.srOnly}" for="catalog-search">${t(placeholder)}</label>${icon("search")}<input id="catalog-search" type="search" name="q" value="${esc(value)}" placeholder="${t(placeholder)}" autocomplete="off" /><button class="${s.iconButton}" type="button" id="clear-search" aria-label="${t("clear")}" ${!value ? "hidden" : ""}>${icon("close")}</button><button class="${s.srOnly}" type="submit">${t("search")}</button></form>`;
}
export function paginate(items, route, pageSize = 8) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(
    pages,
    Math.max(1, Number(route.params.get("page")) || 1),
  );
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    pages,
    total,
  };
}
export function pagination(page, pages) {
  if (pages <= 1) return "";
  return `<nav class="${s.pagination}" aria-label="${t("browseCatalog")}">${button(t("previous"), `data-page="${page - 1}" ${page === 1 ? "disabled" : ""}`)}<span>${number(page)} ${t("of")} ${number(pages)}</span>${button(t("next"), `data-page="${page + 1}" ${page === pages ? "disabled" : ""}`)}</nav>`;
}
export function notify(message, tone = "info") {
  const root = document.querySelector("#notifications");
  if (!root) return;
  root.className = `${s.toast} ${s[tone] || ""}`;
  root.textContent = message;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => {
    root.textContent = "";
  }, 4500);
}
export async function ask(title, description, action) {
  const before = document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.className = s.dialog;
  dialog.setAttribute("aria-labelledby", "dialog-title");
  dialog.setAttribute("aria-describedby", "dialog-description");
  dialog.innerHTML = `<h2 id="dialog-title">${esc(title)}</h2><p id="dialog-description">${esc(description)}</p><div class="${s.actions}">${button(t("cancel"), 'id="dialog-cancel" autofocus')}${button(action, 'id="dialog-confirm"', "danger")}</div>`;
  document.body.append(dialog);
  dialog.showModal();
  return new Promise((resolve) => {
    const finish = (value) => {
      dialog.close();
      dialog.remove();
      if (before?.isConnected) before.focus();
      resolve(value);
    };
    dialog.querySelector("#dialog-cancel").onclick = () => finish(false);
    dialog.querySelector("#dialog-confirm").onclick = () => finish(true);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    });
  });
}
export const normalize = (value) =>
  String(value)
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0300-\u036f]/g, "")
    .replace(/[أإآ]/g, "ا")
    .toLowerCase()
    .trim();
export const matches = (item, query) =>
  normalize(`${item.name_ar || ""} ${item.name_en || ""}`).includes(
    normalize(query),
  );
export { s };
