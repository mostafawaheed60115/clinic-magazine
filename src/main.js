import "./styles/tokens.css";
import { t, locale, setLocale, initLocale } from "./i18n.js";
import { readAll, channel } from "./store.js";
import {
  getAuthState,
  initAuth,
  signIn,
  signOut,
  onAuthChange,
  loadUsers,
} from "./auth.js";
import {
  offersPage,
  brandsPage,
  brandPage,
  productPage,
  notFound,
  authPage,
  bindCarousel,
} from "./pages.js";
import { adminPage, bindAdmin, isDirty, mayLeave, markClean } from "./admin.js";
import { icon, arrow, hydrateImages, notify, s } from "./ui.js";
import m from "./styles/magazine.module.css";

initLocale();
const app = document.querySelector("#app");
let controller = new AbortController();
let version = 0;
let activeHash = location.hash || "#/offers";
let cachedData;
let authReady = false;
let authState = getAuthState();
let authIdentity = authState.session?.user?.id || authState.user?.id || "";

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

function chrome(route, content) {
  const current = route.parts[0];
  const direction = locale === "ar" ? "rtl" : "ltr";
  const admin = current === "admin";
  return `<a class="${m.skip}" href="#main">${t("skip")}</a><div class="${m.shell}"><header class="${m.header}"><a class="${m.logo}" href="#/offers" aria-label="Clinic — ${t("home")}"><img src="/assets/new_logo.png" alt="Clinic" width="92" height="92" /></a>${admin ? `<span class="${m.adminCrumb}">${t("admin")}</span>` : `<nav class="${m.nav}" dir="${direction}" aria-label="${t("browse")}"><a href="#/offers" ${current === "offers" ? 'aria-current="page"' : ""}>${t("offers")}</a><a href="#/brands" ${["brands", "brand", "product"].includes(current) ? 'aria-current="page"' : ""}>${t("brands")}</a></nav>`}<div class="${m.headerTools}"><button id="locale-toggle" class="${m.locale}" aria-label="${locale === "ar" ? "Switch to English" : "التبديل إلى العربية"}">${icon("globe")}<span lang="${locale === "ar" ? "en" : "ar"}">${locale === "ar" ? "English" : "العربية"}</span></button>${!admin ? `<a class="${m.headerSearch}" href="#/brands?focus=search" dir="${direction}">${icon("search")}${t("searchBrands")}</a><button id="app-sign-out" class="${m.locale}" type="button">${t("signOut")}</button>` : ""}</div></header><main id="main">${content}</main></div>${admin ? "" : `<footer class="${m.footer}"><div class="${m.shell}"><div class="${m.footerTop}"><div><h2>${t("footer")}</h2><p>${t("footerText")}</p></div><a href="#/brands">${t("exploreBrands")}${arrow()}</a></div><div class="${m.footerBottom}"><span>© ${new Date().getFullYear()} Clinic</span><a href="#/admin">${t("admin")}</a></div></div></footer>`}<div class="${m.demoNotice}">${authState.mode === "demo" ? t("demo") : ""}</div>`;
}

function loading(content = t("sessionLoading")) {
  return `<div class="${m.loading}" role="status"><div><div class="${m.spinner}"></div>${content}</div></div>`;
}
function setupMessage() {
  return `<div class="${m.pageHead}"><h1 tabindex="-1">${t("loginTitle")}</h1><p>${t("configuredLoginText")}</p></div>`;
}
function scheduleRender() {
  queueMicrotask(() => render());
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
  if (!authState.session) {
    app.innerHTML = authPage(authState.mode || "unconfigured");
    bindAuth(signal);
    document.title = `${t("loginTitle")} | Clinic`;
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
  let data;
  try {
    data = options.keepSearch && cachedData ? cachedData : await readAll();
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
  if (request !== version) return;
  let content;
  if (page === "offers") content = offersPage(data);
  else if (page === "brands") content = brandsPage(data, route);
  else if (page === "brand") content = brandPage(data, route);
  else if (page === "product") content = productPage(data, route);
  else if (page === "admin") content = adminPage(data, route, authState);
  else content = notFound();
  app.innerHTML = chrome(route, content);
  activeHash = location.hash || "#/offers";
  hydrateImages(app);
  bindChrome(signal);
  if (page === "offers") bindCarousel(app, data, signal, hydrateImages);
  if (page === "admin")
    bindAdmin(app, data, route, { signal, render, navigate, authState });
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
    "click",
    async () => {
      if (await mayLeave()) {
        setLocale(locale === "ar" ? "en" : "ar");
        render();
      }
    },
    { signal },
  );
  app.querySelector("#app-sign-out")?.addEventListener(
    "click",
    async () => {
      if (await mayLeave()) {
        await signOut();
        cachedData = null;
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
  if (isDirty()) notify(t("updateNotice"));
  else render();
});
onAuthChange((next) => {
  const nextIdentity = next?.session?.user?.id || next?.user?.id || "";
  if (nextIdentity !== authIdentity) {
    cachedData = null;
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
    render();
  })
  .catch(() => {
    authState = getAuthState();
    authReady = true;
    render();
  });
