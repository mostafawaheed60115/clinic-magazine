import "./styles/tokens.css";
import { t, locale, setLocale, initLocale } from "./i18n.js";
import { readAll, channel, invalidateCatalogCache } from "./store.js";
import {
  getAuthState,
  initAuth,
  signIn,
  signOut,
  onAuthChange,
  loadUsers,
  ensureSessionValid,
} from "./auth.js";
import {
  offersPage,
  brandsPage,
  brandPage,
  productPage,
  notFound,
  authPage,
  bindCarousel,
  novaAttribution,
} from "./pages.js";
import { isDirty, mayLeave, markClean } from "./navigation-state.js";
import { icon, arrow, hydrateImages, notify, s } from "./ui.js";
import m from "./styles/magazine.module.css";
import { consultationUrl, phoneUrl, telesalesUrl } from "./consultation.js";

initLocale();
const app = document.querySelector("#app");
let controller = new AbortController();
let version = 0;
let activeHash = location.hash || "#/offers";
let cachedData;
let authReady = false;
let authState = getAuthState();
let authIdentity = authState.session?.user?.id || authState.user?.id || "";
let renderPending = false;

function getRoute() {
  const direct = location.pathname.replace(/^\/+|\/+$/g, "");
  const raw = location.hash
    ? location.hash.slice(1)
    : direct
      ? `/${direct}`
      : "/offers";
  const [path, query] = raw.split("?");
  let parts;
  try {
    parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    parts = ["404"];
  }
  return {
    path,
    parts,
    params: new URLSearchParams(query),
    direct: !location.hash && Boolean(direct),
  };
}

function chrome(route, content, options = {}) {
  const current = route.parts[0];
  const direction = locale === "ar" ? "rtl" : "ltr";
  const admin = current === "admin";
  const social = `<div class="${m.socialLinks}" aria-label="${t("followUs")}">${[
    ["facebook", "https://www.facebook.com/clinicpharma.assiut"],
    ["instagram", "https://www.instagram.com/clinicpharmaa/"],
    ["tiktok", "https://www.tiktok.com/@clinic.pharma"],
  ]
    .map(
      ([name, url]) =>
        `<a href="${url}" aria-label="${name}" target="_blank" rel="noopener noreferrer">${icon(name)}</a>`,
    )
    .join("")}</div>`;
  const navigation = admin
    ? `<span class="${m.adminCrumb}">${t("admin")}</span>`
    : `<nav class="${m.nav}" dir="${direction}" aria-label="${t("browse")}"><a href="#/offers" ${current === "offers" ? 'aria-current="page"' : ""}>${t("offers")}</a><a href="#/brands" ${["brands", "brand", "product"].includes(current) ? 'aria-current="page"' : ""}>${t("brands")}</a><a href="#/exclusive" ${current === "exclusive" ? 'aria-current="page"' : ""}>${t("exclusiveBrands")}</a><a href="#/events" ${current === "events" ? 'aria-current="page"' : ""}>${t("events")}</a>${social}</nav>`;
  const whatsappHref = !admin
    ? consultationUrl(options.settings?.whatsapp_phone)
    : "";
  const consultation = whatsappHref
    ? `<a class="${m.consultationButton}" href="${whatsappHref}" target="_blank" rel="noopener noreferrer" aria-label="${t("medicalConsultation")}">${icon("whatsapp")}<span>${t("medicalConsultation")}</span></a>`
    : "";
  const telesalesHref = !admin
    ? telesalesUrl(options.settings?.telesales_whatsapp_phone)
    : "";
  const telesalesButton = telesalesHref
    ? `<a class="${m.telesalesButton}" href="${telesalesHref}" target="_blank" rel="noopener noreferrer" aria-label="${t("telesalesWhatsapp")}">${icon("whatsapp")}<span>${t("telesalesWhatsapp")}</span></a>`
    : "";
  const serviceHref = phoneUrl(options.settings?.customer_service_phone);
  const contactHref = phoneUrl(options.settings?.contact_phone);
  const complaintsHref = phoneUrl(options.settings?.complaints_phone);
  const serviceButton =
    !admin && serviceHref
      ? `<a class="${m.serviceButton}" href="${serviceHref}" aria-label="${t("customerService")}">${icon("phone")}<span>${t("customerService")}</span></a>`
      : "";
  return `<a class="${m.skip}" href="#main">${t("skip")}</a><header class="${m.header} ${admin ? m.adminHeader : ""}"><div class="${m.headerInner}"><a class="${m.logo}" href="#/offers" aria-label="Clinic — ${t("home")}"><img src="/assets/clinic-logo-transparent.png" alt="Clinic" width="145" height="145" /></a>${navigation}<div class="${m.headerTools}"><button id="locale-toggle" class="${m.locale}" onclick="this.dispatchEvent(new Event('clinic-locale-toggle'))" aria-label="${locale === "ar" ? "Switch to English" : "التبديل إلى العربية"}">${icon("globe")}<span lang="${locale === "ar" ? "en" : "ar"}">${locale === "ar" ? "English" : "العربية"}</span></button>${!admin ? `<a class="${m.headerSearch}" href="#/brands?focus=search" dir="${direction}" aria-label="${t("searchBrands")}">${icon("search")}</a><button id="app-sign-out" class="${m.locale}" type="button" onclick="this.dispatchEvent(new Event('clinic-sign-out'))">${t("signOut")}</button>` : ""}</div></div></header><div class="${m.shell} ${options.keepSearch ? m.searchRender : ""}"><main id="main">${content}</main></div><footer class="${m.footer}"><div class="${m.footerInner}"><div class="${m.footerTop}"><div><p>${t("footerText")}</p>${novaAttribution()}</div><div class="${m.footerContact}">${contactHref ? `<a href="${contactHref}">${icon("phone")}${t("contactPhone")}: <bdi>${options.settings.contact_phone}</bdi></a>` : ""}${complaintsHref ? `<a href="${complaintsHref}">${icon("phone")}${t("complaintsPhone")}: <bdi>${options.settings.complaints_phone}</bdi></a>` : ""}<p>${icon("map")}${t("branch1")}: ${t("branch1Address")}</p><p>${icon("map")}${t("branch2")}: ${t("branch2Address")}</p></div>${admin ? "" : `<a class="${m.footerExploreLink}" href="#/brands">${t("exploreBrands")}${arrow()}</a>`}</div><div class="${m.footerBottom}"><span>© ${new Date().getFullYear()} Clinic</span>${social}${admin ? "" : `<a href="#/admin">${t("admin")}</a>`}</div></div></footer}<div class="${m.floatingActions}">${consultation}${telesalesButton}${serviceButton}</div><div class="${m.demoNotice}">${authState.mode === "demo" ? t("demo") : ""}</div>`;
}

function loading(content = t("sessionLoading")) {
  return `<div class="${m.loading}" role="status"><div><div class="${m.spinner}"></div>${content}</div></div>`;
}
function setupMessage() {
  return `<div class="${m.pageHead}"><h1 tabindex="-1">${t("loginTitle")}</h1><p>${t("configuredLoginText")}</p></div>`;
}
function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  queueMicrotask(() => {
    renderPending = false;
    render();
  });
}

export function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

export async function render(options = {}) {
  const request = ++version;
  controller.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const route = getRoute();
  const page = route.parts[0] || "offers";
  if (!authReady) {
    app.innerHTML = loading();
    return;
  }
  await ensureSessionValid();
  authState = getAuthState();
  if (!authState.session) {
    app.innerHTML = authPage(
      authState.mode || "unconfigured",
      page === "admin",
    );
    bindAuth(signal);
    document.title = `${t(page === "admin" ? "adminLoginTitle" : "loginTitle")} | Clinic`;
    return;
  }
  if (page === "admin" && !authState.isAdmin) {
    app.innerHTML = chrome(
      route,
      `<div class="${m.pageHead}"><h1 tabindex="-1">${t("notFound")}</h1><p>${t("notFoundText")}</p></div>`,
    );
    bindChrome(signal);
    return;
  }
  if (page === "admin" && route.parts[1] === "users" && !authState.users) {
    try {
      authState.users = await loadUsers();
      authState.usersError = false;
    } catch {
      authState.users = [];
      authState.usersError = true;
    }
  }
  if (request !== version) return;
  if (!options.keepSearch) app.innerHTML = chrome(route, loading(t("loading")));
  const includeEvents =
    page === "events" || (page === "admin" && route.parts[1] === "events");
  const includeEventRequests = page === "admin" && route.parts[1] === "events";
  // Fetch optional route code while the catalog request is in flight, keeping
  // admin-only editing and CSV utilities out of the initial public bundle.
  const pageModulePromise =
    page === "admin"
      ? import("./admin.js")
      : page === "events"
        ? import("./events.js")
        : Promise.resolve(null);
  let data;
  try {
    data =
      options.keepSearch && cachedData
        ? cachedData
        : await readAll({ includeEvents, includeEventRequests });
    cachedData = data;
  } catch {
    if (request !== version) return;
    app.innerHTML = chrome(
      route,
      `<div class="${m.pageHead}"><h1 tabindex="-1">${t("storageError")}</h1><button id="retry" class="${s.button} ${s.primary}">${t("retry")}</button></div>`,
    );
    app.querySelector("#retry").onclick = () => render();
    bindChrome(signal);
    return;
  }
  const pageModule = await pageModulePromise;
  if (request !== version) return;
  let content;
  if (page === "offers") content = offersPage(data);
  else if (page === "brands" || page === "exclusive")
    content = brandsPage(data, route);
  else if (page === "brand") content = brandPage(data, route);
  else if (page === "product") content = productPage(data, route);
  else if (page === "events") content = pageModule.eventsPage(data, authState);
  else if (page === "admin")
    content = pageModule.adminPage(data, route, authState);
  else content = notFound();
  app.innerHTML = chrome(route, content, {
    ...options,
    settings: data.settings,
  });
  activeHash = location.hash || "#/offers";
  hydrateImages(app);
  bindChrome(signal);
  if (page === "offers") bindCarousel(app, data, signal, hydrateImages);
  if (page === "events") pageModule.bindEvents(app, signal, render);
  if (page === "admin")
    pageModule.bindAdmin(app, data, route, {
      signal,
      render,
      navigate,
      authState,
    });
  app.querySelector("#copy-product-link")?.addEventListener(
    "click",
    async (event) => {
      const status = app.querySelector("#share-status");
      try {
        await navigator.clipboard.writeText(event.currentTarget.dataset.url);
        status.textContent = t("copied");
      } catch {
        status.textContent = t("copyFailed");
      }
    },
    { signal },
  );
  document.title = `${app.querySelector("h1")?.textContent || t("magazine")} | Clinic`;
  bindSearch(app, route, signal, options);
}

function bindSearch(root, route, signal, options) {
  const input = root.querySelector("#catalog-search");
  const updateSearch = (value) => {
    const params = new URLSearchParams(route.params);
    params.delete("page");
    params.delete("focus");
    value ? params.set("q", value) : params.delete("q");
    const query = params.toString();
    history.replaceState(null, "", `#${route.path}${query ? `?${query}` : ""}`);
    render({ keepSearch: true, selection: input.selectionStart });
  };
  root.querySelector("#search-form")?.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      updateSearch(input.value);
    },
    { signal },
  );
  input?.addEventListener(
    "input",
    (event) => {
      root.querySelector("#clear-search").hidden = !input.value;
      if (!event.isComposing) updateSearch(input.value);
    },
    { signal },
  );
  input?.addEventListener("compositionend", () => updateSearch(input.value), {
    signal,
  });
  root.querySelector("#clear-search")?.addEventListener(
    "click",
    () => {
      updateSearch("");
    },
    { signal },
  );
  root.querySelectorAll("[data-page]").forEach((btn) =>
    btn.addEventListener(
      "click",
      () => {
        const params = new URLSearchParams(route.params);
        params.set("page", btn.dataset.page);
        navigate(`#${route.path}?${params}`);
      },
      { signal },
    ),
  );
  if (options.keepSearch || route.params.get("focus") === "search") {
    input?.focus();
    if (input && options.selection != null) {
      try {
        input.setSelectionRange(options.selection, options.selection);
      } catch {}
    }
  } else if (options.focus) {
    root.querySelector("h1")?.focus();
    window.scrollTo(0, 0);
  }
}

function bindAuth(signal) {
  const form = app.querySelector("#login-form");
  app.querySelector("#login-password-toggle")?.addEventListener(
    "click",
    (event) => {
      const input = app.querySelector("#login-pass");
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      event.currentTarget.setAttribute(
        "aria-label",
        t(show ? "hidePassword" : "showPassword"),
      );
      event.currentTarget.setAttribute("aria-pressed", String(show));
    },
    { signal },
  );
  app.querySelector("#login-locale-toggle")?.addEventListener(
    "click",
    async () => {
      if (await mayLeave()) {
        setLocale(locale === "ar" ? "en" : "ar");
        render();
      }
    },
    { signal },
  );
  form?.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      const user = form.elements.user;
      const pass = form.elements.pass;
      const error = app.querySelector("#login-error");
      error.textContent = "";
      [user, pass].forEach((field) => {
        field.removeAttribute("aria-invalid");
        app.querySelector(`#${field.id}-error`).textContent = "";
      });
      let first;
      if (!user.value.trim()) {
        app.querySelector(`#${user.id}-error`).textContent = t("required");
        user.setAttribute("aria-invalid", "true");
        first = user;
      }
      if (!pass.value) {
        app.querySelector(`#${pass.id}-error`).textContent = t("required");
        pass.setAttribute("aria-invalid", "true");
        first ||= pass;
      }
      if (first) {
        first.focus();
        return;
      }
      const submit = form.querySelector("[type=submit]");
      submit.disabled = true;
      submit.setAttribute("aria-busy", "true");
      submit.querySelector("span").textContent = t("signInBusy");
      try {
        await signIn(user.value.trim(), pass.value);
        authState = getAuthState();
        if (authState.session) {
          cachedData = null;
          invalidateCatalogCache();
          await render();
        } else error.textContent = t("wrongCredentials");
      } catch (signInError) {
        error.textContent = signInErrorMessage(signInError);
      } finally {
        submit.disabled = false;
        submit.removeAttribute("aria-busy");
        submit.querySelector("span").textContent = t("signIn");
      }
    },
    { signal },
  );
}

function signInErrorMessage(error) {
  const messages = {
    unconfigured: t("configuredLoginText"),
    invalid_credentials: t("wrongCredentials"),
    invalid_username: t("wrongCredentials"),
    inactive: t("wrongCredentials"),
    missing_password: t("required"),
  };
  return messages[error?.code] || t("wrongCredentials");
}

function bindChrome(signal) {
  app.querySelector("#locale-toggle")?.addEventListener(
    "clinic-locale-toggle",
    async () => {
      if (await mayLeave()) {
        setLocale(locale === "ar" ? "en" : "ar");
        render();
      }
    },
    { signal },
  );
  app.querySelector("#app-sign-out")?.addEventListener(
    "clinic-sign-out",
    async () => {
      if (await mayLeave()) {
        await signOut();
        cachedData = null;
        invalidateCatalogCache();
        render();
      }
    },
    { signal },
  );
}

document.addEventListener("click", async (event) => {
  const anchor = event.target.closest("a");
  if (!anchor) return;
  const href = anchor.getAttribute("href");
  if (href === "#main") {
    event.preventDefault();
    document.querySelector("main h1")?.focus();
    return;
  }
  if (
    !href?.startsWith("#/") ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey
  )
    return;
  event.preventDefault();
  if (await mayLeave()) navigate(href);
});
window.addEventListener("hashchange", async () => {
  if (isDirty() && !(await mayLeave())) {
    history.replaceState(null, "", activeHash);
    return;
  }
  markClean();
  render({ focus: true });
});
window.addEventListener("beforeunload", (event) => {
  if (isDirty()) {
    event.preventDefault();
    event.returnValue = "";
  }
});
channel?.addEventListener("message", () => {
  invalidateCatalogCache();
  if (isDirty()) notify(t("updateNotice"));
  else render();
});
onAuthChange((next) => {
  const nextIdentity = next?.session?.user?.id || next?.user?.id || "";
  if (nextIdentity !== authIdentity) {
    cachedData = null;
    invalidateCatalogCache();
    if (authState) authState.users = undefined;
  }
  authIdentity = nextIdentity;
  authState = next;
  authReady = Boolean(next?.ready);
  scheduleRender();
});
initAuth()
  .then((next) => {
    authState = next || getAuthState();
    authIdentity = authState.session?.user?.id || authState.user?.id || "";
    authReady = true;
    scheduleRender();
  })
  .catch(() => {
    authState = getAuthState();
    authReady = true;
    scheduleRender();
  });
