import { t, locale, nameOf, number, money } from "./i18n.js";
import {
  esc,
  icon,
  arrow,
  link,
  image,
  empty,
  searchBox,
  paginate,
  pagination,
  matches,
  safeExternalUrl,
  s,
} from "./ui.js";
import m from "./styles/magazine.module.css";
import a from "./styles/admin.module.css";

export function wordmark(brand) {
  return `<span class="${m.wordmark}" data-style="${brand.style || 0}" dir="ltr">${brand.logo_url ? image(brand.logo_url, nameOf(brand)) : esc(brand.name_en)}</span>`;
}
function brandTile(brand) {
  return `<a href="#/brand/${encodeURIComponent(brand.id)}" class="${m.brandTile}" aria-label="${esc(nameOf(brand))}">${wordmark(brand)}<small>${t("browseCatalog")}${arrow()}</small></a>`;
}
function productCard(product) {
  return `<article class="${m.product}"><a href="#/product/${encodeURIComponent(product.id)}"><div class="${m.productImage}">${image(product.img_url, nameOf(product))}${product.discount != null ? `<span class="${m.discount}">${number(product.discount)}% ${t("discount")}</span>` : ""}</div><div class="${m.productInfo}"><h3>${esc(nameOf(product))}</h3><div class="${m.productDetails}"><span>${number(product.size_value)} ${t(product.size_unit)}</span>${product.qty != null ? `<span>${number(product.qty)} ${t("pack")}</span>` : ""}</div><p class="${m.price}" aria-label="${t("finalPrice")}">${money(product.final_price)}</p></div></a></article>`;
}
function offerCard(offer, data) {
  const brand = data.companies.find((b) => b.id === offer.company_id);
  const destination = brand?.id
    ? link(`#/brand/${encodeURIComponent(brand.id)}`, t("discover"))
    : `<span class="${m.note}">${t("unknownBrand")}</span>`;
  return `<div class="${m.coverCopy}"><span class="${m.brandName}" dir="ltr">${esc(brand?.name_en || "Clinic")}</span><h2>${esc(nameOf(offer))}</h2><p>${esc(offer[`description_${locale}`] || offer.description_en || "")}</p>${destination}</div><div class="${m.coverVisual}">${image(offer.img_link, offer[`description_${locale}`] || t("sampleArt"), "", "eager")}<span class="${m.sampleTag}">${t("sample")}</span></div>`;
}
function authForm(mode, formClass, submitClass) {
  const demo = mode === "demo";
  const notice = demo
    ? `<p class="${m.demoLoginNote}">${t("demoWarning")}<br /><small>${t("demoCredentials")}</small></p>`
    : mode === "unconfigured"
      ? `<p class="${m.demoLoginNote}">${t("configuredLoginText")}</p>`
      : "";
  return `${notice}<form id="login-form" class="${formClass}" novalidate><div class="${m.loginField}"><label for="login-user">${t("username")}</label><input id="login-user" name="user" autocomplete="username" autocapitalize="none" spellcheck="false" dir="ltr" required aria-describedby="login-user-error" /></div><span id="login-user-error" class="${s.error}"></span><div class="${m.loginField}"><div class="${m.loginLabelRow}"><label for="login-pass">${t("password")}</label><span>${t("loginPasswordHint")}</span></div><div class="${m.passwordWrap}"><input id="login-pass" name="pass" type="password" autocomplete="current-password" dir="ltr" required aria-describedby="login-pass-error login-error" /><button type="button" id="login-password-toggle" class="${s.iconButton}" aria-label="${t("showPassword")}" aria-pressed="false">${icon("eye")}</button></div><span id="login-pass-error" class="${s.error}"></span></div><p id="login-error" role="alert" class="${s.error}"></p><button class="${s.button} ${s.primary} ${submitClass}" type="submit"><span>${t("signIn")}</span>${arrow()}</button></form>`;
}

export function authPage(mode = "unconfigured", admin = false) {
  const localeButton = `<button type="button" id="login-locale-toggle" class="${s.ghost}">${icon("globe")}<span>${locale === "ar" ? "English" : "العربية"}</span></button>`;
  if (admin) {
    return `<section class="${a.adminAuthShell}" aria-labelledby="login-title"><div class="${a.adminAuthCard}"><header class="${a.adminAuthHeader}"><div class="${a.adminAuthBrand}"><img src="/assets/clinic-logo-transparent.png" alt="Clinic" width="48" height="48" /><div><span>${t("adminLoginBadge")}</span><strong>Clinic</strong></div></div>${localeButton}</header><div class="${a.adminAuthDivider}" aria-hidden="true"></div><div class="${a.adminAuthBody}"><p class="${a.adminAuthEyebrow}">${t("adminLoginAccess")}</p><h1 id="login-title" tabindex="-1">${t("adminLoginTitle")}</h1><p class="${a.adminAuthText}">${t("adminLoginText")}</p>${authForm(mode, a.adminAuthForm, a.adminAuthSubmit)}<p class="${a.adminAuthFootnote}">${t("adminLoginFootnote")}</p></div></div></section>`;
  }
  return `<section class="${m.loginShell}" aria-labelledby="login-title"><div class="${m.loginTopbar}">${localeButton}</div><div class="${m.loginPanel}"><div class="${m.loginPanelInner}"><img class="${m.loginPanelLogo}" src="/assets/clinic-logo-transparent.png" alt="Clinic" width="96" height="96" /><h1 id="login-title" tabindex="-1">${t("loginTitle")}</h1><p class="${m.loginText}">${t("loginText")}</p>${authForm(mode, m.loginForm, m.loginSubmit)}<div class="${m.loginFooter}"><span>${t("loginFootnote")}</span></div></div></div></section>`;
}
export function offersPage(data) {
  return `<div class="${m.intro}"><div><h1 tabindex="-1">${t("magazine")}</h1><p>${t("subtitle")}</p></div></div>${data.offers.length ? `<section aria-roledescription="${locale === "ar" ? "عارض عروض" : "carousel"}" aria-label="${t("offers")}" id="carousel"><div class="${m.cover}" id="cover" tabindex="0">${offerCard(data.offers[0], data)}</div><div class="${m.carouselFoot}"><div class="${m.slideMeta}" id="slide-position" aria-live="polite"><strong>${number(1)} / ${number(data.offers.length)}</strong><span>${t("offers")}</span></div><div class="${m.dots}">${data.offers.map((offer, i) => `<button class="${m.dot}" data-slide="${i}" aria-label="${t("slide")} ${number(i + 1)}: ${esc(nameOf(offer))}" aria-current="${i === 0}"></button>`).join("")}</div><div class="${m.carouselArrows}"><button class="${s.iconButton}" id="previous-offer" aria-label="${t("previous")}" disabled>${icon("arrow", s.flip)}</button><button class="${s.iconButton}" id="next-offer" aria-label="${t("next")}" disabled>${icon("arrow")}</button></div></div></section>` : empty("offersEmpty", "emptyText")}<section class="${m.section}"><div class="${m.sectionHead}"><div><h2>${t("curated")}</h2><p>${t("curatedText")}</p></div><a class="${m.textLink}" href="#/brands">${t("allBrands")}${arrow()}</a></div><div class="${m.brandGrid}">${data.companies.slice(0, 5).map(brandTile).join("")}</div>${!data.companies.length ? empty() : ""}</section>`;
}
export function brandsPage(data, route) {
  const q = route.params.get("q") || "";
  const list = paginate(
    data.companies.filter((x) => matches(x, q)),
    route,
  );
  return `<div class="${m.pageHead}"><h1 tabindex="-1">${t("allBrands")}</h1><p>${t("brandIntro")}</p></div><div class="${m.toolbar}">${searchBox(q, "searchBrands")}<span class="${m.count}" role="status">${number(list.total)} ${t("results")}</span></div><div class="${m.brandGrid} ${m.directory}">${list.items.map(brandTile).join("")}</div>${list.total ? "" : empty(q ? "noResults" : "empty", q ? "noResultsText" : "emptyText")}${pagination(list.page, list.pages)}`;
}
export function brandPage(data, route) {
  const brand = data.companies.find((b) => b.id === route.parts[1]);
  if (!brand) return notFound();
  const q = route.params.get("q") || "";
  const list = paginate(
    data.products.filter((x) => x.company_id === brand.id && matches(x, q)),
    route,
  );
  return `<nav class="${m.breadcrumbs}" aria-label="${t("back")}"><a href="#/brands">${t("brands")}</a>${arrow()}<span aria-current="page">${esc(nameOf(brand))}</span></nav><div class="${m.brandHero}"><div class="${m.brandBadge}">${wordmark(brand)}</div><div><h1 tabindex="-1">${esc(nameOf(brand))}</h1><p>${t("collection")}${brand.parent_id ? ` · ${esc(nameOf(data.companies.find((b) => b.id === brand.parent_id) || {}))}` : ""}</p>${brand.phone ? `<a href="tel:${esc(brand.phone.replace(/[^+\d]/g, ""))}"><bdi>${esc(brand.phone)}</bdi></a>` : ""}</div></div><div class="${m.toolbar}">${searchBox(q, "searchProducts")}<span class="${m.count}" role="status">${number(list.total)} ${t("results")}</span></div><div class="${m.products}">${list.items.map(productCard).join("")}</div>${list.total ? "" : empty(q ? "noResults" : "empty", q ? "noResultsText" : "emptyText")}${pagination(list.page, list.pages)}<p class="${m.note}">${t("stockNote")}</p>`;
}
export function productPage(data, route) {
  const product = data.products.find((x) => x.id === route.parts[1]);
  if (!product) return notFound();
  const brand = data.companies.find((x) => x.id === product.company_id);
  const external = safeExternalUrl(product.product_url);
  const brandTrail = brand?.id
    ? `<a href="#/brand/${encodeURIComponent(brand.id)}">${esc(nameOf(brand))}</a>`
    : `<span>${t("unknownBrand")}</span>`;
  return `<nav class="${m.breadcrumbs}" aria-label="${t("back")}"><a href="#/brands">${t("brands")}</a>${arrow()}${brandTrail}${arrow()}<span aria-current="page">${esc(nameOf(product))}</span></nav><article class="${m.productDetail}"><div class="${m.productDetailImage}">${image(product.img_url, nameOf(product), "", "eager")}</div><div class="${m.productDetailCopy}"><span class="${m.eyebrow}">${esc(brand ? nameOf(brand) : t("unknownBrand"))}</span><h1 tabindex="-1">${esc(nameOf(product))}</h1><p class="${m.productDetailPrice}">${money(product.final_price)}</p><dl class="${m.productSpecs}"><div><dt>${t("size")}</dt><dd>${number(product.size_value)} ${t(product.size_unit)}</dd></div>${product.qty != null ? `<div><dt>${t("quantity")}</dt><dd>${number(product.qty)} ${t("pack")}</dd></div>` : ""}${product.discount != null ? `<div><dt>${t("discount")}</dt><dd>${number(product.discount)}%</dd></div>` : ""}</dl><div class="${m.productActions}"><button type="button" id="copy-product-link" class="${s.button} ${s.primary}" data-url="${esc(location.href)}">${icon("copy")}${t("share")}</button>${external ? `<a class="${s.button} ${s.secondary}" href="${esc(external)}" target="_blank" rel="noopener noreferrer">${icon("external")}${t("openProduct")}</a>` : ""}</div><p id="share-status" class="${s.status}" role="status" aria-live="polite"></p></div></article>`;
}
export function notFound() {
  return `<div class="${m.pageHead}"><h1 tabindex="-1">${t("notFound")}</h1><p>${t("notFoundText")}</p></div>${link("#/brands", t("exploreBrands"))}`;
}
export function bindCarousel(root, data, signal, hydrate) {
  const cover = root.querySelector("#cover");
  if (!cover) return;
  let current = 0;
  let start;
  root.querySelectorAll("#previous-offer, #next-offer").forEach((button) => {
    button.disabled = data.offers.length < 2;
  });
  const show = (index) => {
    current = (index + data.offers.length) % data.offers.length;
    cover.innerHTML = offerCard(data.offers[current], data);
    cover.classList.remove(m.slideIn);
    void cover.offsetWidth;
    cover.classList.add(m.slideIn);
    hydrate(cover);
    root
      .querySelectorAll("[data-slide]")
      .forEach((button) =>
        button.setAttribute(
          "aria-current",
          String(Number(button.dataset.slide) === current),
        ),
      );
    root.querySelector("#slide-position").innerHTML =
      `<strong>${number(current + 1)} / ${number(data.offers.length)}</strong><span>${t("offers")}</span>`;
  };
  root
    .querySelector("#previous-offer")
    .addEventListener("click", () => show(current - 1), { signal });
  root
    .querySelector("#next-offer")
    .addEventListener("click", () => show(current + 1), { signal });
  root
    .querySelectorAll("[data-slide]")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => show(Number(button.dataset.slide)),
        { signal },
      ),
    );
  cover.style.touchAction = "pan-y";
  cover.addEventListener("dragstart", (event) => event.preventDefault(), {
    signal,
  });
  cover.addEventListener(
    "pointerdown",
    (event) => {
      start = { x: event.clientX, y: event.clientY };
    },
    { signal },
  );
  cover.addEventListener(
    "pointerup",
    (event) => {
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      start = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy))
        show(current + (dx < 0 ? 1 : -1));
    },
    { signal },
  );
  cover.addEventListener(
    "pointercancel",
    () => {
      start = null;
    },
    { signal },
  );
  cover.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        show(current + (event.key === "ArrowRight" ? 1 : -1));
      }
    },
    { signal },
  );
}
